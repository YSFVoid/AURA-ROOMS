import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { AuditEventTypes, Defaults } from '../config/constants.js';
import { ensureDefaults } from '../db/repos/guildSettingsRepo.js';
import { clearByChannel } from '../db/repos/permissionsRepo.js';
import { create, deleteRoom, getByChannel, listAll, transferOwner, updateRoomSettings } from '../db/repos/roomsRepo.js';
import { interpolateTemplate, sanitizeRoomName } from '../utils/format.js';
import { logger } from '../utils/logger.js';
import { runGuildExclusive } from '../utils/guildLock.js';
import { assertBotPerms } from '../utils/guards.js';

export class RoomService {
    constructor(client, permissionService, abuseService, auditLogService) {
        this.client = client;
        this.permissionService = permissionService;
        this.abuseService = abuseService;
        this.auditLogService = auditLogService;
        this.emptyDeleteTimers = new Map();
        this.emptyDeleteDueAt = new Map();
    }

    accessRoles(settings) {
        return settings.roomManagerRoleId
            ? [...settings.trustedRoleIds, settings.roomManagerRoleId]
            : settings.trustedRoleIds;
    }

    async handleLobbyJoin(member, lobbyChannelId, previousChannelId) {
        await runGuildExclusive(member.guild.id, async () => {
            const settings = await ensureDefaults(member.guild.id);

            const joinLeaveDecision = await this.abuseService.enforceJoinLeaveLimiter(member.guild.id, member.id);
            if (!joinLeaveDecision.allowed) {
                await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, joinLeaveDecision);
                return;
            }

            const guildRateDecision = this.abuseService.enforceGuildCreateRateLimit(member.guild.id);
            if (!guildRateDecision.allowed) {
                await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, guildRateDecision);
                return;
            }

            const cooldownDecision = await this.abuseService.enforceCreateCooldown(member.guild.id, member.id, settings.createCooldownSeconds);
            if (!cooldownDecision.allowed) {
                await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, cooldownDecision);
                return;
            }

            const maxRoomsDecision = await this.abuseService.enforceMaxRoomsPerUser(member.guild.id, member.id, settings.maxRoomsPerUser);
            if (!maxRoomsDecision.allowed) {
                await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, maxRoomsDecision);
                return;
            }

            try {
                assertBotPerms(member, [
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.MoveMembers,
                ]);
            } catch (error) {
                await this.auditLogService.logEvent(member.guild.id, {
                    eventType: 'ROOM_CREATE_BLOCKED',
                    result: 'blocked',
                    actorId: member.id,
                    details: error instanceof Error ? error.message : 'Bot permissions missing',
                    level: 'minimal',
                });
                return;
            }

            let roomChannel = null;

            try {
                roomChannel = await this.createTempRoom(member);
            } catch (error) {
                logger.warn({ error, guildId: member.guild.id, userId: member.id }, 'Failed to create room');
                await this.auditLogService.logEvent(member.guild.id, {
                    eventType: 'ROOM_CREATE_FAILED',
                    result: 'failure',
                    actorId: member.id,
                    details: 'Room creation failed before move.',
                    level: 'minimal',
                });
                return;
            }

            try {
                await member.voice.setChannel(roomChannel);
            } catch (error) {
                logger.warn({ error, memberId: member.id }, 'Failed to move member to new room');
                await this.rollbackCreatedRoom(member.guild.id, roomChannel.id, member.id);
                return;
            }

            await this.abuseService.recordCreateSuccess(member.guild.id, member.id, settings.createCooldownSeconds);

            await this.auditLogService.logEvent(member.guild.id, {
                eventType: AuditEventTypes.ROOM_CREATED,
                result: 'success',
                actorId: member.id,
                details: `${member.user.tag} created ${roomChannel.toString()}`,
                level: 'minimal',
            });
        });
    }

    async createTempRoom(member) {
        const settings = await ensureDefaults(member.guild.id);
        const templatedName = interpolateTemplate(settings.defaultTemplate, member);
        const channelName = sanitizeRoomName(templatedName, settings.namingPolicy);

        const roomChannel = await member.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: settings.categoryId,
            userLimit: settings.defaultUserLimit,
            reason: 'AURA Rooms temporary room creation',
        });

        try {
            await create({
                channelId: roomChannel.id,
                guildId: member.guild.id,
                ownerId: member.id,
                privacyMode: settings.defaultPrivacy,
                userLimit: settings.defaultUserLimit,
                autoNameEnabled: true,
                locked: false,
                hidden: false,
            });
        } catch (error) {
            await roomChannel.delete('Rollback: failed to persist temp room').catch(() => null);
            throw error;
        }

        try {
            await this.permissionService.applyPrivacy(roomChannel, settings.defaultPrivacy, member.id, this.accessRoles(settings), { locked: false, hidden: false });
        } catch (error) {
            await this.rollbackCreatedRoom(member.guild.id, roomChannel.id, member.id);
            throw error;
        }

        return roomChannel;
    }

    cancelEmptyDelete(channelId) {
        const timer = this.emptyDeleteTimers.get(channelId);
        if (!timer) return;
        clearTimeout(timer);
        this.emptyDeleteTimers.delete(channelId);
        this.emptyDeleteDueAt.delete(channelId);
    }

    async scheduleEmptyDelete(channelId, delaySeconds) {
        const room = await getByChannel(channelId);
        if (!room) return;

        const settings = await ensureDefaults(room.guildId);
        const timeoutMs = (delaySeconds ?? settings.emptyDeleteSeconds ?? Defaults.EMPTY_DELETE_SECONDS) * 1000;

        this.cancelEmptyDelete(channelId);

        const timer = setTimeout(async () => {
            try {
                await this.deleteRoomIfEmpty(channelId);
            } catch (error) {
                logger.error({ error, channelId }, 'Failed while deleting empty room');
            }
        }, timeoutMs);

        this.emptyDeleteTimers.set(channelId, timer);
        this.emptyDeleteDueAt.set(channelId, Date.now() + timeoutMs);
    }

    async markRoomActive(channelId) {
        this.cancelEmptyDelete(channelId);
        await updateRoomSettings(channelId, { lastActiveAt: new Date() });
    }

    async handleOwnershipTransfer(channelId) {
        const room = await getByChannel(channelId);
        if (!room) return;

        const channel = await this.fetchVoiceChannel(channelId);
        if (!channel) return;

        if (channel.members.has(room.ownerId)) return;

        const nextOwner = channel.members.find((m) => !m.user.bot);
        if (!nextOwner) return;

        const settings = await ensureDefaults(room.guildId);

        await transferOwner(channelId, nextOwner.id);
        await this.permissionService.applyPrivacy(channel, room.privacyMode, nextOwner.id, this.accessRoles(settings), { locked: room.locked, hidden: room.hidden });

        await this.auditLogService.logEvent(room.guildId, {
            eventType: AuditEventTypes.ROOM_TRANSFERRED,
            result: 'success',
            actorId: nextOwner.id,
            details: `Channel ${channel.toString()} owner changed to ${nextOwner.user.tag}`,
            level: 'minimal',
        });
    }

    async deleteRoomIfEmpty(channelId) {
        const room = await getByChannel(channelId);
        if (!room) {
            this.cancelEmptyDelete(channelId);
            return;
        }

        const settings = await ensureDefaults(room.guildId);
        const channel = await this.fetchVoiceChannel(channelId);

        if (channel && channel.members.size > 0) {
            this.cancelEmptyDelete(channelId);
            return;
        }

        if (channel && settings.categoryId && channel.parentId !== settings.categoryId) {
            await deleteRoom(channelId);
            await clearByChannel(channelId);
            await this.abuseService.recordRoomDeleted(room.guildId, room.ownerId);
            this.cancelEmptyDelete(channelId);
            return;
        }

        if (channel) {
            try {
                await channel.delete('AURA Rooms cleanup for empty temporary room');
            } catch (error) {
                logger.warn({ error, channelId }, 'Failed to delete voice channel, will retry');
                await this.scheduleEmptyDelete(channelId, 30);
                return;
            }
        }

        await deleteRoom(channelId);
        await clearByChannel(channelId);
        await this.abuseService.recordRoomDeleted(room.guildId, room.ownerId);
        this.cancelEmptyDelete(channelId);

        await this.auditLogService.logEvent(room.guildId, {
            eventType: AuditEventTypes.ROOM_DELETED,
            result: 'success',
            actorId: room.ownerId,
            details: `Deleted temp room channel ${channelId}`,
            level: 'minimal',
        });
    }

    async onStartupOrphanCleanup() {
        const rooms = await listAll();

        for (const room of rooms) {
            const channel = await this.fetchVoiceChannel(room.channelId);
            if (!channel) {
                await deleteRoom(room.channelId);
                await clearByChannel(room.channelId);
                await this.abuseService.recordRoomDeleted(room.guildId, room.ownerId);
                continue;
            }

            if (channel.members.size === 0) {
                await this.scheduleEmptyDelete(channel.id);
            }
        }
    }

    async getTrackedRoom(channelId) {
        return getByChannel(channelId);
    }

    async handleBlockedJoin(member, lobbyChannelId, previousChannelId, decision) {
        const reason = decision.message ?? 'Room creation is temporarily blocked.';
        const retry = decision.retryAfterSeconds ? ` Retry in ${decision.retryAfterSeconds}s.` : '';

        await member.send(`AURA Rooms: ${reason}${retry}`).catch(() => null);
        await this.tryMoveBack(member, lobbyChannelId, previousChannelId);

        await this.auditLogService.logEvent(member.guild.id, {
            eventType: 'ROOM_CREATE_BLOCKED',
            result: 'blocked',
            actorId: member.id,
            details: `${member.user.tag} blocked: ${decision.code}`,
            level: 'minimal',
        });
    }

    async tryMoveBack(member, lobbyChannelId, previousChannelId) {
        if (!previousChannelId || previousChannelId === lobbyChannelId) return;
        if (member.voice.channelId !== lobbyChannelId) return;

        const previous = await this.client.channels.fetch(previousChannelId).catch(() => null);
        if (!previous || previous.type !== ChannelType.GuildVoice || previous.guild.id !== member.guild.id) return;

        const me = member.guild.members.me;
        if (!me) return;

        const perms = me.permissionsIn(previous);
        if (
            !perms.has(PermissionFlagsBits.MoveMembers) ||
            !perms.has(PermissionFlagsBits.Connect) ||
            !perms.has(PermissionFlagsBits.ViewChannel)
        ) return;

        if (previous.userLimit > 0 && previous.members.size >= previous.userLimit) return;

        await member.voice.setChannel(previous).catch(() => null);
    }

    async rollbackCreatedRoom(guildId, channelId, ownerId) {
        const channel = await this.fetchVoiceChannel(channelId);

        if (channel) {
            const deleted = await channel.delete('Rollback after creation failure').then(() => true).catch(() => false);
            if (!deleted) {
                await this.scheduleEmptyDelete(channelId, 30);
                return;
            }
        }

        await deleteRoom(channelId).catch(() => false);
        await clearByChannel(channelId).catch(() => null);
        await this.abuseService.recordRoomDeleted(guildId, ownerId).catch(() => null);
    }

    async fetchVoiceChannel(channelId) {
        try {
            const fetched = await this.client.channels.fetch(channelId);
            if (!fetched || fetched.type !== ChannelType.GuildVoice) return null;
            return fetched;
        } catch {
            return null;
        }
    }
}
