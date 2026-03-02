import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { AuditEventTypes, Defaults } from '../config/constants.js';
import { ensureDefaults } from '../db/repos/guildSettingsRepo.js';
import { clearByChannel } from '../db/repos/permissionsRepo.js';
import {
    create,
    deleteRoom,
    findByOwner,
    getByChannel,
    listAll,
    transferOwner,
    updateRoomSettings,
} from '../db/repos/roomsRepo.js';
import { interpolateTemplate, sanitizeRoomName } from '../utils/format.js';
import { humanizeDecisionCode } from '../utils/humanize.js';
import { logger } from '../utils/logger.js';
import { traceEvent } from '../utils/voiceTracer.js';
import { renderAuraInterface } from '../ui/auraInterface.js';
import { canClaimRoom } from '../utils/permissions.js';

const RECENT_REUSE_WINDOW_MS = 10_000;
const LOBBY_DEBOUNCE_MS = 1500;
const CLEANUP_THROTTLE_MS = 5 * 60 * 1000;

export class RoomService {
    constructor(client, permissionService, abuseService, auditLogService, templateService) {
        this.client = client;
        this.permissionService = permissionService;
        this.abuseService = abuseService;
        this.auditLogService = auditLogService;
        this.templateService = templateService;
        this.emptyDeleteTimers = new Map();
        this.emptyDeleteDueAt = new Map();
        this.deletingRoomIds = new Set();
        this.inflightCreate = new Map();
        this.lastLobbyEnterAt = new Map();
        this.lastCleanupAt = new Map();
    }

    accessRoles(settings) {
        return settings.roomManagerRoleId
            ? [...settings.trustedRoleIds, settings.roomManagerRoleId]
            : settings.trustedRoleIds;
    }

    async handleLobbyJoin(member, lobbyChannelId, previousChannelId) {
        const guildId = member.guild.id;
        const userId = member.id;
        const requestId = randomUUID();
        const flightKey = `${guildId}:${userId}`;

        logger.info({ requestId, pid: process.pid, guildId, userId, lobbyChannelId, step: 'LOBBY_HANDLER_ENTER' }, 'lobby handler entered');

        const now = Date.now();
        const lastEnter = this.lastLobbyEnterAt.get(flightKey) ?? 0;
        if (now - lastEnter < LOBBY_DEBOUNCE_MS) {
            logger.info({ requestId, userId, step: 'DEBOUNCE_LOBBY_ENTER', elapsed: now - lastEnter }, 'debounced lobby enter');
            traceEvent(guildId, { userId, action: 'DEBOUNCE_LOBBY_ENTER', result: 'skipped', reason: `${now - lastEnter}ms < ${LOBBY_DEBOUNCE_MS}ms` });

            const existing = this.inflightCreate.get(flightKey);
            if (existing) {
                const channelId = await existing;
                if (channelId) await this.tryMoveMemberToRoom(member, channelId, lobbyChannelId);
            }
            return;
        }
        this.lastLobbyEnterAt.set(flightKey, now);

        const existing = this.inflightCreate.get(flightKey);
        if (existing) {
            logger.info({ requestId, userId, step: 'JOIN_WAITED_EXISTING' }, 'waiting for inflight create');
            traceEvent(guildId, { userId, action: 'JOIN_WAITED_EXISTING', result: 'pending' });
            const channelId = await existing;
            if (channelId) {
                await this.tryMoveMemberToRoom(member, channelId, lobbyChannelId);
                traceEvent(guildId, { userId, action: 'JOIN_WAITED_EXISTING', toChannelId: channelId, result: 'moved' });
            }
            return;
        }

        let resolveInflight;
        const inflightPromise = new Promise((resolve) => { resolveInflight = resolve; });
        this.inflightCreate.set(flightKey, inflightPromise);

        let createdChannelId = null;
        try {
            createdChannelId = await this.executeLobbyJoin(member, lobbyChannelId, previousChannelId, requestId);
        } finally {
            resolveInflight(createdChannelId);
            this.inflightCreate.delete(flightKey);
        }
    }

    async tryMoveMemberToRoom(member, channelId, lobbyChannelId) {
        if (member.voice.channelId !== lobbyChannelId) return;
        const channel = await this.fetchVoiceChannel(channelId);
        if (!channel) return;
        await member.voice.setChannel(channel).catch(() => null);
    }

    async executeLobbyJoin(member, lobbyChannelId, previousChannelId, requestId) {
        const guildId = member.guild.id;
        const userId = member.id;

        if (member.voice.channelId !== lobbyChannelId) {
            traceEvent(guildId, { userId, action: 'LOBBY_RECHECK', result: 'skip', reason: 'member_not_in_lobby' });
            return null;
        }

        const [settings, abuseState] = await Promise.all([
            ensureDefaults(guildId),
            this.abuseService.getState(guildId, userId),
        ]);
        traceEvent(guildId, { userId, action: 'SETTINGS_LOADED', result: 'ok', reason: `category=${settings.categoryId}` });

        this.throttledCleanup(member.guild, settings);

        const reusedOwnedRoom = await this.tryReuseExistingOwnerRoom(member, settings);
        if (reusedOwnedRoom) {
            logger.info({ requestId, userId, roomChannelId: reusedOwnedRoom.id, step: 'REUSED_OWNER_ROOM' }, 'reused existing room');
            traceEvent(guildId, { userId, action: 'ROOM_REUSE', toChannelId: reusedOwnedRoom.id, result: 'success', reason: 'existing_owner_room' });
            return reusedOwnedRoom.id;
        }

        const reusedRecentRoom = await this.tryReuseRecentCreatedRoom(member, abuseState);
        if (reusedRecentRoom) {
            logger.info({ requestId, userId, roomChannelId: reusedRecentRoom.id, step: 'REUSED_RECENT_CREATE' }, 'reused recent room');
            traceEvent(guildId, { userId, action: 'ROOM_REUSE', toChannelId: reusedRecentRoom.id, result: 'success', reason: 'recent_create_window' });
            return reusedRecentRoom.id;
        }

        const joinLeaveDecision = await this.abuseService.enforceJoinLeaveLimiter(guildId, userId);
        if (!joinLeaveDecision.allowed) {
            traceEvent(guildId, { userId, action: 'ABUSE_CHECK', result: 'blocked', reason: joinLeaveDecision.code });
            await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, joinLeaveDecision);
            return null;
        }

        const guildRateDecision = this.abuseService.enforceGuildCreateRateLimit(guildId);
        if (!guildRateDecision.allowed) {
            traceEvent(guildId, { userId, action: 'ABUSE_CHECK', result: 'blocked', reason: guildRateDecision.code });
            await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, guildRateDecision);
            return null;
        }

        const cooldownDecision = await this.abuseService.enforceCreateCooldown(guildId, userId, settings.createCooldownSeconds);
        if (!cooldownDecision.allowed) {
            traceEvent(guildId, { userId, action: 'ABUSE_CHECK', result: 'blocked', reason: cooldownDecision.code });
            await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, cooldownDecision);
            return null;
        }

        const maxRoomsDecision = await this.abuseService.enforceMaxRoomsPerUser(guildId, userId, settings.maxRoomsPerUser);
        if (!maxRoomsDecision.allowed) {
            traceEvent(guildId, { userId, action: 'ABUSE_CHECK', result: 'blocked', reason: maxRoomsDecision.code });
            await this.handleBlockedJoin(member, lobbyChannelId, previousChannelId, maxRoomsDecision);
            return null;
        }

        traceEvent(guildId, { userId, action: 'ABUSE_CHECK', result: 'passed' });

        const me = member.guild.members.me;
        if (!me) {
            logger.error({ guildId }, 'Bot guild member not found');
            traceEvent(guildId, { userId, action: 'BOT_PERMS_CHECK', result: 'error', reason: 'Bot guild member not found' });
            return null;
        }

        const requiredPerms = [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.MoveMembers,
        ];

        const permSource = settings.categoryId && member.guild.channels.cache.has(settings.categoryId)
            ? me.permissionsIn(settings.categoryId)
            : me.permissions;

        const missingPerms = requiredPerms.filter((perm) => !permSource.has(perm));
        if (missingPerms.length > 0) {
            const labels = missingPerms.map((perm) => String(perm)).join(', ');
            const msg = `Bot missing permissions: ${labels}`;
            logger.warn({ guildId, categoryId: settings.categoryId }, msg);
            traceEvent(guildId, { userId, action: 'BOT_PERMS_CHECK', result: 'blocked', reason: msg });
            await this.auditLogService.logEvent(guildId, {
                eventType: 'ROOM_CREATE_BLOCKED',
                result: 'blocked',
                actorId: userId,
                details: msg,
                level: 'minimal',
            });
            return null;
        }

        traceEvent(guildId, { userId, action: 'BOT_PERMS_CHECK', result: 'passed' });

        let roomChannel;
        try {
            traceEvent(guildId, { userId, action: 'CREATE_ROOM_START', result: 'pending' });
            roomChannel = await this.createTempRoom(member, settings);
            logger.info({ requestId, userId, roomChannelId: roomChannel.id, step: 'CREATED_NEW_ROOM' }, 'created new room');
            traceEvent(guildId, { userId, action: 'CREATE_ROOM_DONE', toChannelId: roomChannel.id, result: 'success' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn({ error, guildId, userId }, 'Failed to create channel');
            traceEvent(guildId, { userId, action: 'CREATE_ROOM_DONE', result: 'error', reason: msg });
            await this.auditLogService.logEvent(guildId, {
                eventType: 'ROOM_CREATE_FAILED',
                result: 'failure',
                actorId: userId,
                details: `Room creation failed: ${msg}`,
                level: 'minimal',
            });
            return null;
        }

        try {
            traceEvent(guildId, { userId, action: 'MOVE_MEMBER', toChannelId: roomChannel.id, result: 'pending' });
            await member.voice.setChannel(roomChannel);
            traceEvent(guildId, { userId, action: 'MOVE_MEMBER', toChannelId: roomChannel.id, result: 'success' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn({ error, guildId, userId }, 'Failed to move member to new room');
            traceEvent(guildId, { userId, action: 'MOVE_MEMBER', toChannelId: roomChannel.id, result: 'error', reason: msg });
            await member
                .send(`AURA Rooms: Created your channel, but could not move you. Please join ${roomChannel.toString()}`)
                .catch(() => null);
        }

        try {
            await create({
                channelId: roomChannel.id,
                guildId,
                ownerId: userId,
                privacyMode: settings.defaultPrivacy,
                userLimit: settings.defaultUserLimit,
                autoNameEnabled: true,
                locked: false,
                hidden: false,
            });
        } catch (error) {
            logger.error({ error, channelId: roomChannel.id }, 'DB persist failed, rolling back channel');
            await this.rollbackCreatedRoom(guildId, roomChannel.id, userId);
            return null;
        }

        try {
            await this.permissionService.applyPrivacy(
                roomChannel,
                settings.defaultPrivacy,
                userId,
                this.accessRoles(settings),
                { locked: false, hidden: false },
            );
        } catch (error) {
            logger.warn({ error, channelId: roomChannel.id }, 'Failed to apply privacy after fast-move');
        }

        await this.abuseService.recordCreateSuccess(guildId, userId, settings.createCooldownSeconds, roomChannel.id);

        await this.auditLogService.logEvent(guildId, {
            eventType: AuditEventTypes.ROOM_CREATED,
            result: 'success',
            actorId: userId,
            details: `${member.user.tag} created ${roomChannel.toString()}`,
            level: 'minimal',
        });

        traceEvent(guildId, { userId, action: 'ROOM_CREATED', toChannelId: roomChannel.id, result: 'success' });

        await this.sendAutoPanel(member, roomChannel).catch((error) => {
            logger.warn({ error, channelId: roomChannel.id }, 'Failed to send auto panel');
        });

        return roomChannel.id;
    }

    throttledCleanup(guild, settings) {
        const last = this.lastCleanupAt.get(guild.id) ?? 0;
        if (Date.now() - last < CLEANUP_THROTTLE_MS) return;
        this.lastCleanupAt.set(guild.id, Date.now());
        this.cleanupUntrackedEmptyRooms(guild, settings).catch((error) => {
            logger.warn({ error, guildId: guild.id }, 'Background cleanup failed');
        });
    }

    async tryReuseExistingOwnerRoom(member, settings) {
        const ownedRooms = await findByOwner(member.guild.id, member.id);
        if (ownedRooms.length === 0) return null;

        for (const room of ownedRooms) {
            const channel = await this.fetchVoiceChannel(room.channelId);
            if (!channel) {
                await deleteRoom(room.channelId).catch(() => false);
                await clearByChannel(room.channelId).catch(() => null);
                await this.abuseService.recordRoomDeleted(room.guildId, room.ownerId).catch(() => null);
                continue;
            }

            if (settings.categoryId && channel.parentId !== settings.categoryId) {
                await deleteRoom(room.channelId).catch(() => false);
                await clearByChannel(room.channelId).catch(() => null);
                await this.abuseService.recordRoomDeleted(room.guildId, room.ownerId).catch(() => null);
                continue;
            }

            if (member.voice.channelId === channel.id) {
                await this.markRoomActive(channel.id);
                return channel;
            }

            const moved = await member.voice.setChannel(channel).then(() => true).catch(() => false);
            if (!moved) {
                await member
                    .send(`AURA Rooms: Your room already exists at ${channel.toString()}. Please join it directly.`)
                    .catch(() => null);
                return channel;
            }

            await this.markRoomActive(channel.id);
            return channel;
        }

        return null;
    }

    async tryReuseRecentCreatedRoom(member, abuseState) {
        if (!abuseState?.lastCreateAt || !abuseState?.lastCreatedChannelId) return null;
        const elapsed = Date.now() - abuseState.lastCreateAt.getTime();
        if (elapsed > RECENT_REUSE_WINDOW_MS) return null;

        const room = await getByChannel(abuseState.lastCreatedChannelId);
        if (!room || room.ownerId !== member.id || room.guildId !== member.guild.id) return null;

        const channel = await this.fetchVoiceChannel(abuseState.lastCreatedChannelId);
        if (!channel) return null;

        if (member.voice.channelId !== channel.id) {
            const moved = await member.voice.setChannel(channel).then(() => true).catch(() => false);
            if (!moved) return null;
        }

        await this.markRoomActive(channel.id);
        return channel;
    }

    async createTempRoom(member, settingsOverride) {
        const settings = settingsOverride ?? await ensureDefaults(member.guild.id);
        const templatedName = interpolateTemplate(settings.defaultTemplate, member);
        const channelName = sanitizeRoomName(templatedName, settings.namingPolicy);

        const createOptions = {
            name: channelName,
            type: ChannelType.GuildVoice,
            userLimit: settings.defaultUserLimit,
            reason: 'AURA Rooms temporary room creation',
            permissionOverwrites: [
                {
                    id: member.guild.id,
                    deny: [PermissionFlagsBits.Connect],
                },
                {
                    id: member.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
                },
                {
                    id: member.guild.members.me.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.MoveMembers,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.SendMessagesInThreads,
                    ],
                },
            ],
        };

        if (settings.categoryId) {
            const category = member.guild.channels.cache.get(settings.categoryId);
            if (category && category.type === ChannelType.GuildCategory) {
                createOptions.parent = settings.categoryId;
            } else {
                logger.warn({ guildId: member.guild.id, categoryId: settings.categoryId }, 'Category not found in cache');
            }
        }

        return member.guild.channels.create(createOptions);
    }

    cancelEmptyDelete(channelId) {
        const timer = this.emptyDeleteTimers.get(channelId);
        if (!timer) return;
        clearTimeout(timer);
        this.emptyDeleteTimers.delete(channelId);
        this.emptyDeleteDueAt.delete(channelId);
    }

    async scheduleEmptyDelete(channelId, delaySeconds) {
        if (this.emptyDeleteTimers.has(channelId)) return;

        const room = await getByChannel(channelId);
        if (!room) return;

        const settings = await ensureDefaults(room.guildId);
        const timeoutMs = (delaySeconds ?? settings.emptyDeleteSeconds ?? Defaults.EMPTY_DELETE_SECONDS) * 1000;

        if (timeoutMs <= 0) {
            try {
                await this.deleteRoomIfEmpty(channelId);
            } catch (error) {
                logger.error({ error, channelId }, 'Instant delete failed');
            }
            return;
        }

        const timer = setTimeout(async () => {
            this.emptyDeleteTimers.delete(channelId);
            this.emptyDeleteDueAt.delete(channelId);
            try {
                await this.deleteRoomIfEmpty(channelId);
            } catch (error) {
                logger.error({ error, channelId }, 'Failed while deleting empty room');
            }
        }, timeoutMs);

        this.emptyDeleteTimers.set(channelId, timer);
        this.emptyDeleteDueAt.set(channelId, Date.now() + timeoutMs);
    }

    getDeleteDueAt(channelId) {
        return this.emptyDeleteDueAt.get(channelId) ?? null;
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

        const nextOwner = channel.members.find((member) => !member.user.bot);
        if (!nextOwner) return;

        const settings = await ensureDefaults(room.guildId);
        await transferOwner(channelId, nextOwner.id);
        await this.permissionService.applyPrivacy(
            channel,
            room.privacyMode,
            nextOwner.id,
            this.accessRoles(settings),
            { locked: room.locked, hidden: room.hidden },
        );

        await this.auditLogService.logEvent(room.guildId, {
            eventType: AuditEventTypes.ROOM_TRANSFERRED,
            result: 'success',
            actorId: nextOwner.id,
            details: `Channel ${channel.toString()} owner changed to ${nextOwner.user.tag}`,
            level: 'minimal',
        });
    }

    async deleteRoomIfEmpty(channelId) {
        if (this.deletingRoomIds.has(channelId)) return;
        this.deletingRoomIds.add(channelId);

        try {
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

            if (channel && (!settings.categoryId || channel.parentId === settings.categoryId)) {
                try {
                    await channel.delete('AURA Rooms cleanup for empty temporary room');
                } catch (error) {
                    logger.warn({ error, channelId }, 'Failed to delete voice channel');
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
        } finally {
            this.deletingRoomIds.delete(channelId);
        }
    }

    async normalizeDuplicateOwnerRooms() {
        const rooms = await listAll();
        const grouped = new Map();
        const categoryCache = new Map();
        const summaryByGuild = new Map();

        for (const room of rooms) {
            const key = `${room.guildId}:${room.ownerId}`;
            const bucket = grouped.get(key) ?? [];
            bucket.push(room);
            grouped.set(key, bucket);
        }

        for (const duplicateRooms of grouped.values()) {
            if (duplicateRooms.length < 2) continue;

            duplicateRooms.sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (aTime !== bTime) return bTime - aTime;
                const aId = BigInt(a.channelId);
                const bId = BigInt(b.channelId);
                if (aId === bId) return 0;
                return aId > bId ? -1 : 1;
            });

            const staleRooms = duplicateRooms.slice(1);
            for (const staleRoom of staleRooms) {
                let categoryId = categoryCache.get(staleRoom.guildId);
                if (categoryId === undefined) {
                    const settings = await ensureDefaults(staleRoom.guildId);
                    categoryId = settings.categoryId ?? null;
                    categoryCache.set(staleRoom.guildId, categoryId);
                }

                const channel = await this.fetchVoiceChannel(staleRoom.channelId);
                await deleteRoom(staleRoom.channelId).catch(() => false);
                await clearByChannel(staleRoom.channelId).catch(() => null);
                await this.abuseService.recordRoomDeleted(staleRoom.guildId, staleRoom.ownerId).catch(() => null);

                let channelsDeleted = 0;
                if (channel && channel.members.size === 0 && categoryId && channel.parentId === categoryId) {
                    const deleted = await channel
                        .delete('AURA Rooms startup duplicate cleanup')
                        .then(() => true)
                        .catch(() => false);
                    if (deleted) channelsDeleted = 1;
                }

                const summary = summaryByGuild.get(staleRoom.guildId) ?? { staleRecords: 0, staleChannelsDeleted: 0 };
                summary.staleRecords += 1;
                summary.staleChannelsDeleted += channelsDeleted;
                summaryByGuild.set(staleRoom.guildId, summary);
            }
        }

        for (const [guildId, summary] of summaryByGuild.entries()) {
            await this.auditLogService.logEvent(guildId, {
                eventType: 'STARTUP_DUPLICATES_CLEANED',
                result: 'success',
                details: `Removed ${summary.staleRecords} stale room records and deleted ${summary.staleChannelsDeleted} empty duplicate channels.`,
                level: 'minimal',
            });
        }
    }

    async onStartupOrphanCleanup() {
        await this.normalizeDuplicateOwnerRooms();
        const guilds = this.client.guilds.cache.map((guild) => guild);
        for (const guild of guilds) {
            const settings = await ensureDefaults(guild.id).catch(() => null);
            if (!settings) continue;
            await this.cleanupUntrackedEmptyRooms(guild, settings);
        }

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
        const decisionLabel = humanizeDecisionCode(decision.code);

        await member.send(`AURA Rooms: ${reason}${retry}`).catch(() => null);
        await this.tryMoveBack(member, lobbyChannelId, previousChannelId);

        await this.auditLogService.logEvent(member.guild.id, {
            eventType: 'ROOM_CREATE_BLOCKED',
            result: 'blocked',
            actorId: member.id,
            details: `${member.user.tag} blocked: ${decisionLabel}`,
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
        traceEvent(guildId, { userId: ownerId, action: 'ROLLBACK', toChannelId: channelId, result: 'pending' });

        const channel = await this.fetchVoiceChannel(channelId);
        if (channel) {
            const deleted = await channel.delete('Rollback after creation failure').then(() => true).catch(() => false);
            if (!deleted) {
                logger.warn({ guildId, channelId }, 'Rollback channel delete failed');
                return;
            }
        }

        await deleteRoom(channelId).catch(() => false);
        await clearByChannel(channelId).catch(() => null);
        await this.abuseService.recordRoomDeleted(guildId, ownerId).catch(() => null);
        traceEvent(guildId, { userId: ownerId, action: 'ROLLBACK', toChannelId: channelId, result: 'done' });
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

    async sendAutoPanel(member, roomChannel) {
        const room = await getByChannel(roomChannel.id);
        if (!room) return;

        const settings = await ensureDefaults(member.guild.id);
        const interfaceChannel = settings.interfaceChannelId
            ? member.guild.channels.cache.get(settings.interfaceChannelId)
            : null;
        const templates = this.templateService
            ? await this.templateService.listTemplates(member.guild.id, member.id)
            : [];
        const canClaim = canClaimRoom(member, roomChannel, room.ownerId);

        const rendered = renderAuraInterface({
            room,
            channel: roomChannel,
            templates,
            canClaim,
            state: { view: 'main', selectedTemplate: null },
        });

        const deliveryChannels = [];
        deliveryChannels.push(roomChannel);
        if (interfaceChannel && interfaceChannel.type === ChannelType.GuildText && interfaceChannel.id !== roomChannel.id) {
            deliveryChannels.push(interfaceChannel);
        }

        const updatePayload = {
            embeds: [rendered.embed],
            components: rendered.components,
        };

        let message = null;
        if (room.panelMessageId) {
            for (const channel of deliveryChannels) {
                if (!channel?.isTextBased?.()) continue;
                const existing = await channel.messages.fetch(room.panelMessageId).catch(() => null);
                if (!existing) continue;
                const edited = await existing.edit(updatePayload).then(() => true).catch(() => false);
                if (!edited) continue;
                message = existing;
                break;
            }
        }

        if (!message) {
            for (const channel of deliveryChannels) {
                if (!channel?.isTextBased?.()) continue;
                message = await channel.send(updatePayload).catch(() => null);
                if (message) break;
            }
        }

        if (message) {
            await updateRoomSettings(room.channelId, { panelMessageId: message.id });
        }
    }

    async cleanupUntrackedEmptyRooms(guild, settingsOverride) {
        const settings = settingsOverride ?? await ensureDefaults(guild.id);
        if (!settings.categoryId) return;

        const trackedRooms = await listAll();
        const trackedIds = new Set(
            trackedRooms
                .filter((room) => room.guildId === guild.id)
                .map((room) => room.channelId),
        );

        const candidates = guild.channels.cache.filter((channel) =>
            channel.type === ChannelType.GuildVoice &&
            channel.parentId === settings.categoryId &&
            channel.name !== '➕ Create Room' &&
            !trackedIds.has(channel.id),
        );

        for (const channel of candidates.values()) {
            if (channel.members.size > 0) continue;
            await channel
                .delete('AURA Rooms cleanup for untracked empty room')
                .then(() => true)
                .catch(() => false);
        }
    }
}
