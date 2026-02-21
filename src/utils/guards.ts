import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type PermissionResolvable,
  type StringSelectMenuInteraction,
  type VoiceChannel,
} from 'discord.js';
import { getByChannel } from '../db/repos/roomsRepo.js';
import type { ITempRoom } from '../db/models/TempRoom.js';
import { PermissionError, ValidationError } from './errors.js';
import { canControlRoom } from './permissions.js';

export type GuildInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

export function assertGuildInteraction(interaction: GuildInteraction): {
  member: GuildMember;
} {
  if (!interaction.guild || !interaction.member || !('voice' in interaction.member)) {
    throw new ValidationError('This action can only be used inside a server.');
  }

  return { member: interaction.member as GuildMember };
}

export function assertAdmin(interaction: GuildInteraction): void {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    throw new PermissionError('Administrator permission is required.');
  }
}

export async function assertInTempRoom(interaction: GuildInteraction): Promise<{
  member: GuildMember;
  channel: VoiceChannel;
  room: ITempRoom;
}> {
  const { member } = assertGuildInteraction(interaction);
  const voiceChannel = member.voice.channel;

  if (!voiceChannel || voiceChannel.type !== 2) {
    throw new ValidationError('Join a tracked temp room first.');
  }

  const room = await getByChannel(voiceChannel.id);
  if (!room) {
    throw new ValidationError('This voice channel is not a tracked temp room.');
  }

  return {
    member,
    channel: voiceChannel,
    room,
  };
}

export function assertOwnerOrTrusted(
  member: GuildMember,
  ownerId: string,
  trustedRoleIds: string[],
): void {
  if (!canControlRoom(member, ownerId, trustedRoleIds)) {
    throw new PermissionError('You are not allowed to manage this room.');
  }
}

export function assertBotPerms(
  member: GuildMember,
  required: PermissionResolvable[],
  channelId?: string,
): void {
  const me = member.guild.members.me;
  if (!me) {
    throw new PermissionError('Bot member not found in this guild.');
  }

  const source =
    channelId && member.guild.channels.cache.has(channelId)
      ? me.permissionsIn(channelId)
      : me.permissions;

  const missing = required.filter((perm) => !source.has(perm));
  if (missing.length > 0) {
    const labels = missing
      .map((perm) => {
        if (typeof perm === 'string') {
          return perm;
        }

        const value = typeof perm === 'number' ? BigInt(perm) : perm;
        if (value === PermissionFlagsBits.ManageChannels) {
          return 'ManageChannels';
        }
        if (value === PermissionFlagsBits.MoveMembers) {
          return 'MoveMembers';
        }
        if (value === PermissionFlagsBits.ViewChannel) {
          return 'ViewChannel';
        }
        if (value === PermissionFlagsBits.Connect) {
          return 'Connect';
        }
        return String(perm);
      })
      .join(', ');
    throw new PermissionError(`Bot is missing required permissions: ${labels}`);
  }
}
