import type { APISelectMenuOption, VoiceChannel } from 'discord.js';
import type { ITempRoom } from '../db/models/TempRoom.js';
import type { IUserTemplate } from '../db/models/UserTemplate.js';
import { createInfoEmbed } from './embeds.js';
import {
  createRoomKickRow,
  createRoomPermissionButtons,
  createRoomPrimaryButtons,
  createRoomPrivacyRow,
  createRoomTemplateRow,
} from './components.js';

export function buildRoomPanelEmbed(room: ITempRoom, channel: VoiceChannel) {
  return createInfoEmbed('Room Panel', `Manage ${channel.toString()}`, [
    { name: 'Owner', value: `<@${room.ownerId}>`, inline: true },
    { name: 'Privacy', value: room.privacyMode, inline: true },
    { name: 'User Limit', value: String(room.userLimit), inline: true },
    { name: 'Members', value: String(channel.members.size), inline: true },
    { name: 'Activity', value: room.activityTag || 'None', inline: true },
    {
      name: 'Auto Name',
      value: room.autoNameEnabled ? 'Enabled' : 'Disabled',
      inline: true,
    },
  ]);
}

export function buildRoomPanelComponents(params: {
  room: ITempRoom;
  channel: VoiceChannel;
  templates: IUserTemplate[];
  canClaim: boolean;
}) {
  const kickOptions: APISelectMenuOption[] = params.channel.members
    .filter((member) => !member.user.bot)
    .map((member) => ({
      label: member.displayName.slice(0, 100),
      value: member.id,
      description: member.id === params.room.ownerId ? 'Current owner' : undefined,
    }));

  const templateOptions: APISelectMenuOption[] = params.templates.map((template) => ({
    label: template.name.slice(0, 100),
    value: template.name,
    description: `${template.privacyMode} • limit ${template.userLimit}`.slice(0, 100),
  }));

  return [
    createRoomPrimaryButtons(params.canClaim, params.room.autoNameEnabled),
    createRoomPermissionButtons(),
    createRoomPrivacyRow(params.room.privacyMode),
    createRoomKickRow(kickOptions),
    createRoomTemplateRow(templateOptions),
  ];
}
