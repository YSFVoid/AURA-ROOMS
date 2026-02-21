import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type PermissionResolvable,
  type VoiceChannel,
} from 'discord.js';

const REQUIRED_BOT_PERMISSIONS: Array<{ perm: PermissionResolvable; name: string }> = [
  { perm: PermissionFlagsBits.ManageChannels, name: 'ManageChannels' },
  { perm: PermissionFlagsBits.MoveMembers, name: 'MoveMembers' },
  { perm: PermissionFlagsBits.ViewChannel, name: 'ViewChannel' },
  { perm: PermissionFlagsBits.Connect, name: 'Connect' },
];

export function getMissingBotPermissionsNamed(guild: Guild): string[] {
  const me = guild.members.me;
  if (!me) {
    return ['Bot member not found'];
  }

  return REQUIRED_BOT_PERMISSIONS.filter(({ perm }) => !me.permissions.has(perm)).map(
    ({ name }) => name,
  );
}

export function getMissingPermissionsInChannel(
  member: GuildMember,
  required: PermissionResolvable[],
  channelId: string,
): string[] {
  const me = member.guild.members.me;
  if (!me) {
    return ['Bot member not found'];
  }

  const perms = me.permissionsIn(channelId);
  return required.filter((perm) => !perms.has(perm)).map((perm) => String(perm));
}

export function isAdministrator(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function hasTrustedRole(member: GuildMember, trustedRoleIds: string[]): boolean {
  if (trustedRoleIds.length === 0) {
    return false;
  }

  return trustedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

export function canControlRoom(
  member: GuildMember,
  ownerId: string,
  trustedRoleIds: string[],
): boolean {
  if (member.id === ownerId) {
    return true;
  }

  if (isAdministrator(member)) {
    return true;
  }

  return hasTrustedRole(member, trustedRoleIds);
}

export function canClaimRoom(member: GuildMember, channel: VoiceChannel, ownerId: string): boolean {
  if (channel.members.has(ownerId)) {
    return false;
  }

  return channel.members.has(member.id);
}

export function isValidUserLimit(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 99;
}
