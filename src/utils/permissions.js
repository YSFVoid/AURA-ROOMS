import { PermissionFlagsBits } from 'discord.js';

const REQUIRED_BOT_PERMISSIONS = [
    { perm: PermissionFlagsBits.ManageChannels, name: 'ManageChannels' },
    { perm: PermissionFlagsBits.MoveMembers, name: 'MoveMembers' },
    { perm: PermissionFlagsBits.ViewChannel, name: 'ViewChannel' },
    { perm: PermissionFlagsBits.Connect, name: 'Connect' },
];

export function permissionToName(perm) {
    if (typeof perm === 'string') return perm;

    const value = typeof perm === 'number' ? BigInt(perm) : perm;
    if (value === PermissionFlagsBits.ManageChannels) return 'ManageChannels';
    if (value === PermissionFlagsBits.MoveMembers) return 'MoveMembers';
    if (value === PermissionFlagsBits.ViewChannel) return 'ViewChannel';
    if (value === PermissionFlagsBits.Connect) return 'Connect';
    return String(perm);
}

export function getMissingBotPermissionsNamed(guild) {
    const me = guild.members.me;
    if (!me) return ['Bot member not found'];
    return REQUIRED_BOT_PERMISSIONS.filter(({ perm }) => !me.permissions.has(perm)).map(({ name }) => name);
}

export function isAdministrator(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function hasTrustedRole(member, trustedRoleIds) {
    if (trustedRoleIds.length === 0) return false;
    return trustedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

export function hasRoomManagerRole(member, roomManagerRoleId) {
    if (!roomManagerRoleId) return false;
    return member.roles.cache.has(roomManagerRoleId);
}

export function canControlRoom(member, ownerId, trustedRoleIds) {
    if (member.id === ownerId) return true;
    if (isAdministrator(member)) return true;
    return hasTrustedRole(member, trustedRoleIds);
}

export function canModerateRoom(member, ownerId, trustedRoleIds, roomManagerRoleId) {
    if (canControlRoom(member, ownerId, trustedRoleIds)) return true;
    return hasRoomManagerRole(member, roomManagerRoleId);
}

export function canClaimRoom(member, channel, ownerId) {
    if (channel.members.has(ownerId)) return false;
    return channel.members.has(member.id);
}

export function isValidUserLimit(value) {
    return Number.isInteger(value) && value >= 0 && value <= 99;
}
