import { PermissionFlagsBits } from 'discord.js';
import { getByChannel } from '../db/repos/roomsRepo.js';
import { PermissionError, ValidationError } from './errors.js';
import { canControlRoom, canModerateRoom, permissionToName } from './permissions.js';

export function assertGuildInteraction(interaction) {
    if (!interaction.guild || !interaction.member || !('voice' in interaction.member)) {
        throw new ValidationError('This action can only be used inside a server.');
    }
    return { member: interaction.member };
}

export function assertAdmin(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        throw new PermissionError('Administrator permission is required.');
    }
}

export async function assertInTempRoom(interaction) {
    const { member } = assertGuildInteraction(interaction);
    const voiceChannel = member.voice.channel;

    if (!voiceChannel || voiceChannel.type !== 2) {
        throw new ValidationError('Join a tracked temp room first.');
    }

    const room = await getByChannel(voiceChannel.id);
    if (!room) throw new ValidationError('This voice channel is not a tracked temp room.');

    return { member, channel: voiceChannel, room };
}

export function assertOwnerOrTrusted(member, ownerId, trustedRoleIds) {
    if (!canControlRoom(member, ownerId, trustedRoleIds)) {
        throw new PermissionError('You are not allowed to manage this room.');
    }
}

export function assertRoomActionAllowed(member, ownerId, trustedRoleIds, roomManagerRoleId, scope) {
    if (scope === 'full') {
        assertOwnerOrTrusted(member, ownerId, trustedRoleIds);
        return;
    }
    if (!canModerateRoom(member, ownerId, trustedRoleIds, roomManagerRoleId)) {
        throw new PermissionError('You are not allowed to moderate this room.');
    }
}

export function assertBotPerms(member, required, channelId) {
    const me = member.guild.members.me;
    if (!me) throw new PermissionError('Bot member not found in this guild.');

    const source =
        channelId && member.guild.channels.cache.has(channelId)
            ? me.permissionsIn(channelId)
            : me.permissions;

    const missing = required.filter((perm) => !source.has(perm));
    if (missing.length > 0) {
        const labels = missing.map((perm) => permissionToName(perm)).join(', ');
        throw new PermissionError(`Bot is missing required permissions: ${labels}`);
    }
}
