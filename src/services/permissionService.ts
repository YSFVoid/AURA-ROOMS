import {
  PermissionFlagsBits,
  type OverwriteResolvable,
  type VoiceChannel,
} from 'discord.js';
import type { PrivacyMode } from '../config/constants.js';
import { SafeLimits, SNOWFLAKE_REGEX } from '../config/safeLimits.js';
import {
  listByChannel,
  removePermission,
  setPermission,
} from '../db/repos/permissionsRepo.js';
import type {
  RoomPermissionAction,
  RoomPermissionType,
} from '../db/models/RoomPermission.js';
import { truncate } from '../utils/format.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

export class PermissionService {
  private assertManageChannelPerm(channel: VoiceChannel): void {
    const me = channel.guild.members.me;
    if (!me || !me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
      throw new PermissionError('Bot needs ManageChannels permission in this room.');
    }
  }

  private assertSnowflake(targetId: string): void {
    if (!SNOWFLAKE_REGEX.test(targetId)) {
      throw new ValidationError('Invalid target ID.');
    }
  }

  private async assertPermissionEntryLimit(
    channelId: string,
    type: RoomPermissionType,
    targetId: string,
  ): Promise<void> {
    const existing = await listByChannel(channelId);
    const alreadyExists = existing.some((row) => row.type === type && row.targetId === targetId);

    if (!alreadyExists && existing.length >= SafeLimits.MAX_ALLOW_DENY_ENTRIES) {
      throw new ValidationError(
        `Room permission entry limit reached (${SafeLimits.MAX_ALLOW_DENY_ENTRIES}).`,
      );
    }
  }

  private async assertNoPrivilegeEscalation(params: {
    channel: VoiceChannel;
    ownerId: string;
    trustedRoleIds: string[];
    type: RoomPermissionType;
    targetId: string;
    action: RoomPermissionAction;
  }): Promise<void> {
    if (params.type === 'role' && params.targetId === params.channel.guild.roles.everyone.id) {
      throw new ValidationError('Cannot modify @everyone via allow/deny list.');
    }

    if (params.action !== 'deny') {
      return;
    }

    if (params.type === 'user' && params.targetId === params.ownerId) {
      throw new ValidationError('Cannot deny the room owner.');
    }

    if (params.type === 'user' && params.trustedRoleIds.length > 0) {
      const member = await params.channel.guild.members.fetch(params.targetId).catch(() => null);
      if (
        member &&
        params.trustedRoleIds.some((roleId) => member.roles.cache.has(roleId))
      ) {
        throw new ValidationError('Cannot deny users with trusted roles.');
      }
    }

    if (params.type === 'role' && params.trustedRoleIds.includes(params.targetId)) {
      throw new ValidationError('Cannot deny trusted roles.');
    }
  }

  private async setAction(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
    type: RoomPermissionType,
    targetId: string,
    action: RoomPermissionAction,
  ): Promise<void> {
    this.assertManageChannelPerm(channel);
    this.assertSnowflake(targetId);
    await this.assertNoPrivilegeEscalation({
      channel,
      ownerId,
      trustedRoleIds,
      type,
      targetId,
      action,
    });
    await this.assertPermissionEntryLimit(channel.id, type, targetId);

    await setPermission(channel.id, type, targetId, action);
    await this.applyPrivacy(channel, mode, ownerId, trustedRoleIds);
  }

  public async applyPrivacy(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
  ): Promise<void> {
    this.assertManageChannelPerm(channel);

    const roomPermissions = await listByChannel(channel.id);
    const overwrites = this.buildOverwrites(
      channel,
      mode,
      ownerId,
      trustedRoleIds,
      roomPermissions.map((row) => ({
        type: row.type,
        targetId: row.targetId,
        action: row.action,
      })),
    );

    await channel.permissionOverwrites.set(overwrites);
  }

  public async setUserLimit(channel: VoiceChannel, userLimit: number): Promise<void> {
    this.assertManageChannelPerm(channel);
    await channel.setUserLimit(userLimit);
  }

  public async rename(channel: VoiceChannel, nextName: string): Promise<void> {
    this.assertManageChannelPerm(channel);
    await channel.setName(truncate(nextName, SafeLimits.MAX_ROOM_NAME_LEN));
  }

  public async allowUser(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
    userId: string,
  ): Promise<void> {
    await this.setAction(channel, mode, ownerId, trustedRoleIds, 'user', userId, 'allow');
  }

  public async denyUser(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
    userId: string,
  ): Promise<void> {
    await this.setAction(channel, mode, ownerId, trustedRoleIds, 'user', userId, 'deny');
  }

  public async allowRole(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
    roleId: string,
  ): Promise<void> {
    await this.setAction(channel, mode, ownerId, trustedRoleIds, 'role', roleId, 'allow');
  }

  public async denyRole(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
    roleId: string,
  ): Promise<void> {
    await this.setAction(channel, mode, ownerId, trustedRoleIds, 'role', roleId, 'deny');
  }

  public async removeTarget(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
    type: RoomPermissionType,
    targetId: string,
  ): Promise<void> {
    this.assertManageChannelPerm(channel);
    await removePermission(channel.id, type, targetId);
    await this.applyPrivacy(channel, mode, ownerId, trustedRoleIds);
  }

  public buildOverwrites(
    channel: VoiceChannel,
    mode: PrivacyMode,
    ownerId: string,
    trustedRoleIds: string[],
    explicitPermissions: Array<{
      type: RoomPermissionType;
      targetId: string;
      action: RoomPermissionAction;
    }>,
  ): OverwriteResolvable[] {
    const overwrites: OverwriteResolvable[] = [];

    const everyoneDeny: bigint[] = [];
    const everyoneAllow: bigint[] = [];

    if (mode === 'public') {
      everyoneAllow.push(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect);
    }

    if (mode === 'locked') {
      everyoneAllow.push(PermissionFlagsBits.ViewChannel);
      everyoneDeny.push(PermissionFlagsBits.Connect);
    }

    if (mode === 'private') {
      everyoneDeny.push(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect);
    }

    overwrites.push({
      id: channel.guild.roles.everyone.id,
      allow: everyoneAllow,
      deny: everyoneDeny,
    });

    const accessAllow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect];

    overwrites.push({
      id: ownerId,
      allow: accessAllow,
      deny: [],
    });

    const sortedTrusted = [...new Set(trustedRoleIds)].sort((a, b) => a.localeCompare(b));
    for (const roleId of sortedTrusted) {
      overwrites.push({
        id: roleId,
        allow: accessAllow,
        deny: [],
      });
    }

    const sortedExplicit = [...explicitPermissions].sort((a, b) => {
      if (a.type === b.type) {
        return a.targetId.localeCompare(b.targetId);
      }
      return a.type.localeCompare(b.type);
    });

    for (const entry of sortedExplicit) {
      const allow = entry.action === 'allow' ? accessAllow : [];
      const deny =
        entry.action === 'deny'
          ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
          : [];

      overwrites.push({
        id: entry.targetId,
        allow,
        deny,
      });
    }

    return overwrites;
  }
}
