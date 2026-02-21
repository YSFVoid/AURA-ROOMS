import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type GuildMember,
  type VoiceChannel,
} from 'discord.js';
import { Defaults } from '../config/constants.js';
import { ensureDefaults } from '../db/repos/guildSettingsRepo.js';
import { clearByChannel } from '../db/repos/permissionsRepo.js';
import {
  create,
  deleteRoom,
  getByChannel,
  listAll,
  transferOwner,
  updateRoomSettings,
} from '../db/repos/roomsRepo.js';
import { AbuseService } from './abuseService.js';
import { AuditLogService } from './auditLogService.js';
import { PermissionService } from './permissionService.js';
import { interpolateTemplate } from '../utils/format.js';
import { logger } from '../utils/logger.js';
import { runGuildExclusive } from '../utils/guildLock.js';
import { assertBotPerms } from '../utils/guards.js';

export class RoomService {
  private readonly emptyDeleteTimers = new Map<string, NodeJS.Timeout>();

  public constructor(
    private readonly client: Client,
    private readonly permissionService: PermissionService,
    private readonly abuseService: AbuseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  public async handleLobbyJoin(member: GuildMember, lobbyChannelId: string): Promise<void> {
    await runGuildExclusive(member.guild.id, async () => {
      const settings = await ensureDefaults(member.guild.id);

      const joinLeaveDecision = await this.abuseService.enforceJoinLeaveLimiter(
        member.guild.id,
        member.id,
      );
      if (!joinLeaveDecision.allowed) {
        await this.auditLogService.logEvent(member.guild.id, {
          action: 'room_create_blocked',
          result: 'blocked',
          actorId: member.id,
          details: `${member.user.tag} blocked by join/leave limiter from ${lobbyChannelId}`,
        });
        return;
      }

      const guildRateDecision = this.abuseService.enforceGuildCreateRateLimit(member.guild.id);
      if (!guildRateDecision.allowed) {
        await this.auditLogService.logEvent(member.guild.id, {
          action: 'room_create_blocked',
          result: 'blocked',
          actorId: member.id,
          details: `${member.user.tag} blocked by guild create rate limit.`,
        });
        return;
      }

      const cooldownDecision = await this.abuseService.enforceCreateCooldown(
        member.guild.id,
        member.id,
        settings.createCooldownSeconds,
      );
      if (!cooldownDecision.allowed) {
        await this.auditLogService.logEvent(member.guild.id, {
          action: 'room_create_blocked',
          result: 'blocked',
          actorId: member.id,
          details: `${member.user.tag} blocked by create cooldown.`,
        });
        return;
      }

      const maxRoomsDecision = await this.abuseService.enforceMaxRoomsPerUser(
        member.guild.id,
        member.id,
        settings.maxRoomsPerUser,
      );
      if (!maxRoomsDecision.allowed) {
        await this.auditLogService.logEvent(member.guild.id, {
          action: 'room_create_blocked',
          result: 'blocked',
          actorId: member.id,
          details: `${member.user.tag} blocked by max rooms limit.`,
        });
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
          action: 'room_create_blocked',
          result: 'blocked',
          actorId: member.id,
          details: error instanceof Error ? error.message : 'Bot permissions missing',
        });
        return;
      }

      let roomChannel: VoiceChannel | null = null;

      try {
        roomChannel = await this.createTempRoom(member);
      } catch (error) {
        logger.warn({ error, guildId: member.guild.id, userId: member.id }, 'Failed to create room');
        await this.auditLogService.logEvent(member.guild.id, {
          action: 'room_create_failed',
          result: 'failure',
          actorId: member.id,
          details: 'Room creation failed before move.',
        });
        return;
      }

      try {
        await member.voice.setChannel(roomChannel);
      } catch (error) {
        logger.warn({ error, memberId: member.id }, 'Failed to move member to new room');
        await this.rollbackCreatedRoom(member.guild.id, roomChannel.id, member.id);
        await this.auditLogService.logEvent(member.guild.id, {
          action: 'room_create_failed',
          result: 'failure',
          actorId: member.id,
          details: 'Move to created room failed. Rollback attempted.',
        });
        return;
      }

      await this.abuseService.recordCreateSuccess(
        member.guild.id,
        member.id,
        settings.createCooldownSeconds,
      );

      await this.auditLogService.logEvent(member.guild.id, {
        action: 'room_created',
        result: 'success',
        actorId: member.id,
        details: `${member.user.tag} created ${roomChannel.toString()}`,
      });
    });
  }

  public async createTempRoom(member: GuildMember): Promise<VoiceChannel> {
    const settings = await ensureDefaults(member.guild.id);
    const channelName = interpolateTemplate(settings.defaultTemplate, member);

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
      });
    } catch (error) {
      await roomChannel.delete('Rollback: failed to persist temp room').catch(() => null);
      throw error;
    }

    try {
      await this.permissionService.applyPrivacy(
        roomChannel,
        settings.defaultPrivacy,
        member.id,
        settings.trustedRoleIds,
      );
    } catch (error) {
      await this.rollbackCreatedRoom(member.guild.id, roomChannel.id, member.id);
      throw error;
    }

    return roomChannel;
  }

  public cancelEmptyDelete(channelId: string): void {
    const timer = this.emptyDeleteTimers.get(channelId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.emptyDeleteTimers.delete(channelId);
  }

  public async scheduleEmptyDelete(channelId: string, delaySeconds?: number): Promise<void> {
    const room = await getByChannel(channelId);
    if (!room) {
      return;
    }

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
  }

  public async markRoomActive(channelId: string): Promise<void> {
    this.cancelEmptyDelete(channelId);
    await updateRoomSettings(channelId, { lastActiveAt: new Date() });
  }

  public async handleOwnershipTransfer(channelId: string): Promise<void> {
    const room = await getByChannel(channelId);
    if (!room) {
      return;
    }

    const channel = await this.fetchVoiceChannel(channelId);
    if (!channel) {
      return;
    }

    if (channel.members.has(room.ownerId)) {
      return;
    }

    const nextOwner = channel.members.find((guildMember) => !guildMember.user.bot);
    if (!nextOwner) {
      return;
    }

    const settings = await ensureDefaults(room.guildId);

    await transferOwner(channelId, nextOwner.id);
    await this.permissionService.applyPrivacy(
      channel,
      room.privacyMode,
      nextOwner.id,
      settings.trustedRoleIds,
    );

    await this.auditLogService.logEvent(room.guildId, {
      action: 'ownership_transfer',
      result: 'success',
      actorId: nextOwner.id,
      details: `Channel ${channel.toString()} owner changed to ${nextOwner.user.tag}`,
    });
  }

  public async deleteRoomIfEmpty(channelId: string): Promise<void> {
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

      await this.auditLogService.logEvent(room.guildId, {
        action: 'room_delete_skipped_unmanaged',
        result: 'info',
        actorId: room.ownerId,
        details: `Skipped channel deletion for unmanaged channel ${channelId}.`,
      });
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
      action: 'room_deleted',
      result: 'success',
      actorId: room.ownerId,
      details: `Deleted temp room channel ${channelId}`,
    });
  }

  public async onStartupOrphanCleanup(): Promise<void> {
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

  public async getTrackedRoom(channelId: string) {
    return getByChannel(channelId);
  }

  private async rollbackCreatedRoom(guildId: string, channelId: string, ownerId: string): Promise<void> {
    const channel = await this.fetchVoiceChannel(channelId);

    if (channel) {
      const deleted = await channel
        .delete('Rollback after creation failure')
        .then(() => true)
        .catch(() => false);

      if (!deleted) {
        await this.scheduleEmptyDelete(channelId, 30);
        return;
      }
    }

    await deleteRoom(channelId).catch(() => false);
    await clearByChannel(channelId).catch(() => null);
    await this.abuseService.recordRoomDeleted(guildId, ownerId).catch(() => null);
  }

  private async fetchVoiceChannel(channelId: string): Promise<VoiceChannel | null> {
    try {
      const fetched = await this.client.channels.fetch(channelId);
      if (!fetched || fetched.type !== ChannelType.GuildVoice) {
        return null;
      }

      return fetched;
    } catch {
      return null;
    }
  }
}
