import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type VoiceChannel,
} from 'discord.js';
import { ComponentIds } from '../../config/constants.js';
import { SafeLimits } from '../../config/safeLimits.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { transferOwner, updateRoomSettings } from '../../db/repos/roomsRepo.js';
import type {
  AppContext,
  ButtonHandler,
  ModalHandler,
  SelectMenuHandler,
  SlashCommandModule,
} from '../../types/index.js';
import {
  createPermissionModal,
  createRoomActivityModal,
  createRoomLimitModal,
  createRoomRenameModal,
} from '../../ui/components.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { buildRoomPanelComponents, buildRoomPanelEmbed } from '../../ui/roomPanel.js';
import { ValidationError } from '../../utils/errors.js';
import {
  assertBotPerms,
  assertInTempRoom,
  assertOwnerOrTrusted,
} from '../../utils/guards.js';
import { canClaimRoom, isValidUserLimit } from '../../utils/permissions.js';
import { getRequestId } from '../../utils/requestContext.js';
import { handleRoomActivity } from './activity.js';

interface RoomContext {
  member: GuildMember;
  channel: VoiceChannel;
  room: Awaited<ReturnType<typeof assertInTempRoom>>['room'];
  settings: Awaited<ReturnType<typeof ensureDefaults>>;
}

async function getRoomContext(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<RoomContext> {
  const roomContext = await assertInTempRoom(interaction);
  const settings = await ensureDefaults(roomContext.member.guild.id);
  return { ...roomContext, settings };
}

async function getControllableRoomContext(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<RoomContext> {
  const context = await getRoomContext(interaction);
  assertOwnerOrTrusted(context.member, context.room.ownerId, context.settings.trustedRoleIds);
  return context;
}

async function panelPayload(appContext: AppContext, member: GuildMember, channel: VoiceChannel) {
  const room = await appContext.roomService.getTrackedRoom(channel.id);
  if (!room) {
    return null;
  }

  const templates = await appContext.templateService.listTemplates(member.guild.id, member.id);
  const canClaim = canClaimRoom(member, channel, room.ownerId);

  return {
    embeds: [buildRoomPanelEmbed(room, channel)],
    components: buildRoomPanelComponents({ room, channel, templates, canClaim }),
  };
}

async function refreshPanel(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  appContext: AppContext,
): Promise<void> {
  const context = await getRoomContext(interaction);
  const payload = await panelPayload(appContext, context.member, context.channel);

  if (!payload) {
    throw new ValidationError('This channel is not a tracked temp room.');
  }

  await interaction.update(payload);
}

async function assertUserExistsInGuild(guildMember: GuildMember, userId: string): Promise<void> {
  const target = await guildMember.guild.members.fetch(userId).catch(() => null);
  if (!target) {
    throw new ValidationError('User does not exist in this guild.');
  }
}

function assertRoleExistsInGuild(guildMember: GuildMember, roleId: string): void {
  const role = guildMember.guild.roles.cache.get(roleId);
  if (!role) {
    throw new ValidationError('Role does not exist in this guild.');
  }

  if (role.id === guildMember.guild.roles.everyone.id) {
    throw new ValidationError('Cannot modify @everyone via allow/deny actions.');
  }
}

export async function handleRoomPanel(
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> {
  const controlled = await getControllableRoomContext(interaction);
  const payload = await panelPayload(context, controlled.member, controlled.channel);

  if (!payload) {
    throw new ValidationError('Unable to load room panel.');
  }

  await interaction.reply({ ...payload, ephemeral: true });
}

export const roomCommand: SlashCommandModule = {
  data: new SlashCommandBuilder()
    .setName('room')
    .setDescription('Manage your temp voice room')
    .addSubcommand((subcommand) =>
      subcommand.setName('panel').setDescription('Open your room control panel'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('activity')
        .setDescription('Set room activity and auto-name state')
        .addStringOption((option) =>
          option
            .setName('tag')
            .setDescription('Activity tag')
            .setMaxLength(SafeLimits.MAX_ACTIVITY_TAG_LEN),
        )
        .addBooleanOption((option) =>
          option.setName('autoname').setDescription('Auto name enabled'),
        ),
    ),

  async execute(interaction, context) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'panel') {
      await handleRoomPanel(interaction, context);
      return;
    }

    if (subcommand === 'activity') {
      await handleRoomActivity(interaction, context);
      return;
    }

    await interaction.reply({
      embeds: [createErrorEmbed('Room', 'Unknown room action.')],
      ephemeral: true,
    });
  },
};

export const roomButtonHandlers: ButtonHandler[] = [
  {
    customId: ComponentIds.ROOM_RENAME_BUTTON,
    async execute(interaction: ButtonInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
      await interaction.showModal(createRoomRenameModal(context.channel.name));
    },
  },
  {
    customId: ComponentIds.ROOM_LIMIT_BUTTON,
    async execute(interaction: ButtonInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
      await interaction.showModal(createRoomLimitModal(context.room.userLimit));
    },
  },
  {
    customId: ComponentIds.ROOM_ALLOW_USER_BUTTON,
    async execute(interaction: ButtonInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
      await interaction.showModal(
        createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_USER, 'User ID'),
      );
    },
  },
  {
    customId: ComponentIds.ROOM_DENY_USER_BUTTON,
    async execute(interaction: ButtonInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
      await interaction.showModal(
        createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_DENY_USER, 'User ID'),
      );
    },
  },
  {
    customId: ComponentIds.ROOM_ALLOW_ROLE_BUTTON,
    async execute(interaction: ButtonInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
      await interaction.showModal(
        createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_ROLE, 'Role ID'),
      );
    },
  },
  {
    customId: ComponentIds.ROOM_DENY_ROLE_BUTTON,
    async execute(interaction: ButtonInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
      await interaction.showModal(
        createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_DENY_ROLE, 'Role ID'),
      );
    },
  },
  {
    customId: ComponentIds.ROOM_CLAIM_BUTTON,
    async execute(interaction: ButtonInteraction, appContext: AppContext): Promise<void> {
      const context = await getRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      if (!canClaimRoom(context.member, context.channel, context.room.ownerId)) {
        throw new ValidationError(
          'Claim is only available when the owner is absent from this room.',
        );
      }

      await transferOwner(context.channel.id, context.member.id);
      await appContext.permissionService.applyPrivacy(
        context.channel,
        context.room.privacyMode,
        context.member.id,
        context.settings.trustedRoleIds,
      );

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_claim',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Claimed room ${context.channel.id}`,
      });

      await refreshPanel(interaction, appContext);
    },
  },
  {
    customId: ComponentIds.ROOM_ACTIVITY_BUTTON,
    async execute(interaction: ButtonInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      await interaction.showModal(createRoomActivityModal(context.room.activityTag ?? ''));
    },
  },
  {
    customId: ComponentIds.ROOM_AUTONAME_TOGGLE,
    async execute(interaction: ButtonInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      await updateRoomSettings(context.room.channelId, {
        autoNameEnabled: !context.room.autoNameEnabled,
        lastActiveAt: new Date(),
      });

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_autoname_toggle',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Set autoName=${!context.room.autoNameEnabled} for ${context.channel.id}`,
      });

      await refreshPanel(interaction, appContext);
    },
  },
];

export const roomSelectHandlers: SelectMenuHandler[] = [
  {
    customId: ComponentIds.ROOM_PRIVACY_SELECT,
    async execute(interaction: StringSelectMenuInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const mode = interaction.values[0] as 'public' | 'locked' | 'private';
      await appContext.permissionService.applyPrivacy(
        context.channel,
        mode,
        context.room.ownerId,
        context.settings.trustedRoleIds,
      );
      await updateRoomSettings(context.room.channelId, {
        privacyMode: mode,
        lastActiveAt: new Date(),
      });

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_privacy_change',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Set privacy=${mode} for ${context.channel.id}`,
      });

      await refreshPanel(interaction, appContext);
    },
  },
  {
    customId: ComponentIds.ROOM_KICK_SELECT,
    async execute(interaction: StringSelectMenuInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.MoveMembers], context.channel.id);

      const targetId = interaction.values[0];
      if (targetId === 'none') {
        await interaction.deferUpdate();
        return;
      }

      const targetMember = await context.member.guild.members.fetch(targetId).catch(() => null);
      if (
        !targetMember ||
        !targetMember.voice.channelId ||
        targetMember.voice.channelId !== context.channel.id
      ) {
        throw new ValidationError('Selected member is not in this room.');
      }

      await targetMember.voice.disconnect();

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_kick_member',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Kicked ${targetMember.id} from ${context.channel.id}`,
      });

      await refreshPanel(interaction, appContext);
    },
  },
  {
    customId: ComponentIds.ROOM_TEMPLATE_SELECT,
    async execute(interaction: StringSelectMenuInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const selected = interaction.values[0];
      if (selected === 'none') {
        await interaction.deferUpdate();
        return;
      }

      await appContext.templateService.applyTemplateToRoom({
        templateName: selected,
        guildId: context.member.guild.id,
        ownerId: context.member.id,
        member: context.member,
        channel: context.channel,
        room: context.room,
        trustedRoleIds: context.settings.trustedRoleIds,
      });

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_template_apply',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Applied template=${selected} to ${context.channel.id}`,
      });

      await refreshPanel(interaction, appContext);
    },
  },
];

export const roomModalHandlers: ModalHandler[] = [
  {
    customId: ComponentIds.ROOM_RENAME_MODAL,
    async execute(interaction: ModalSubmitInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const nextName = interaction.fields.getTextInputValue(ComponentIds.ROOM_RENAME_INPUT).trim();
      if (nextName.length === 0 || nextName.length > SafeLimits.MAX_ROOM_NAME_LEN) {
        throw new ValidationError(
          `Room name must be 1-${SafeLimits.MAX_ROOM_NAME_LEN} characters.`,
        );
      }

      await appContext.permissionService.rename(context.channel, nextName);
      await updateRoomSettings(context.room.channelId, { lastActiveAt: new Date() });

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_rename',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Renamed ${context.channel.id}`,
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Room Rename', 'Room name updated.')],
        ephemeral: true,
      });
    },
  },
  {
    customId: ComponentIds.ROOM_LIMIT_MODAL,
    async execute(interaction: ModalSubmitInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const raw = interaction.fields.getTextInputValue(ComponentIds.ROOM_LIMIT_INPUT).trim();
      const limit = Number(raw);
      if (!Number.isFinite(limit) || !isValidUserLimit(limit)) {
        throw new ValidationError('Limit must be an integer between 0 and 99.');
      }

      await appContext.permissionService.setUserLimit(context.channel, limit);
      await updateRoomSettings(context.room.channelId, {
        userLimit: limit,
        lastActiveAt: new Date(),
      });

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_limit',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Set userLimit=${limit} for ${context.channel.id}`,
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Room Limit', `User limit set to ${limit}.`)],
        ephemeral: true,
      });
    },
  },
  {
    customId: ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_USER,
    async execute(interaction: ModalSubmitInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const userId = interaction.fields
        .getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT)
        .trim();
      await assertUserExistsInGuild(context.member, userId);

      await appContext.permissionService.allowUser(
        context.channel,
        context.room.privacyMode,
        context.room.ownerId,
        context.settings.trustedRoleIds,
        userId,
      );

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_allow_user',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Allowed user=${userId} in ${context.channel.id}`,
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Room Permission', `Allowed user ${userId}.`)],
        ephemeral: true,
      });
    },
  },
  {
    customId: ComponentIds.ROOM_PERMISSION_MODAL_DENY_USER,
    async execute(interaction: ModalSubmitInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const userId = interaction.fields
        .getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT)
        .trim();
      await assertUserExistsInGuild(context.member, userId);

      await appContext.permissionService.denyUser(
        context.channel,
        context.room.privacyMode,
        context.room.ownerId,
        context.settings.trustedRoleIds,
        userId,
      );

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_deny_user',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Denied user=${userId} in ${context.channel.id}`,
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Room Permission', `Denied user ${userId}.`)],
        ephemeral: true,
      });
    },
  },
  {
    customId: ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_ROLE,
    async execute(interaction: ModalSubmitInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const roleId = interaction.fields
        .getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT)
        .trim();
      assertRoleExistsInGuild(context.member, roleId);

      await appContext.permissionService.allowRole(
        context.channel,
        context.room.privacyMode,
        context.room.ownerId,
        context.settings.trustedRoleIds,
        roleId,
      );

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_allow_role',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Allowed role=${roleId} in ${context.channel.id}`,
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Room Permission', `Allowed role ${roleId}.`)],
        ephemeral: true,
      });
    },
  },
  {
    customId: ComponentIds.ROOM_PERMISSION_MODAL_DENY_ROLE,
    async execute(interaction: ModalSubmitInteraction, appContext: AppContext): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

      const roleId = interaction.fields
        .getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT)
        .trim();
      assertRoleExistsInGuild(context.member, roleId);

      await appContext.permissionService.denyRole(
        context.channel,
        context.room.privacyMode,
        context.room.ownerId,
        context.settings.trustedRoleIds,
        roleId,
      );

      await appContext.auditLogService.logEvent(context.member.guild.id, {
        action: 'room_deny_role',
        result: 'success',
        actorId: context.member.id,
        requestId: getRequestId(interaction),
        details: `Denied role=${roleId} in ${context.channel.id}`,
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Room Permission', `Denied role ${roleId}.`)],
        ephemeral: true,
      });
    },
  },
  {
    customId: ComponentIds.ROOM_ACTIVITY_MODAL,
    async execute(interaction: ModalSubmitInteraction): Promise<void> {
      const context = await getControllableRoomContext(interaction);
      const value = interaction.fields.getTextInputValue(ComponentIds.ROOM_ACTIVITY_INPUT).trim();

      if (value.length > SafeLimits.MAX_ACTIVITY_TAG_LEN) {
        throw new ValidationError(
          `Activity must be at most ${SafeLimits.MAX_ACTIVITY_TAG_LEN} characters.`,
        );
      }

      await updateRoomSettings(context.room.channelId, {
        activityTag: value.length > 0 ? value : undefined,
        lastActiveAt: new Date(),
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Room Activity', 'Room activity updated.')],
        ephemeral: true,
      });
    },
  },
];
