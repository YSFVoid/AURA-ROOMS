import {
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type CategoryChannel,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
  type Role,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';
import {
  ChannelNames,
  ComponentIds,
  Defaults,
  type PrivacyMode,
} from '../../config/constants.js';
import { get as getGuildSettings, upsertWizard } from '../../db/repos/guildSettingsRepo.js';
import { add as addLobby } from '../../db/repos/lobbyRepo.js';
import type { AppContext, ButtonHandler } from '../../types/index.js';
import { createSetupWizardButtons } from '../../ui/components.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { ValidationError } from '../../utils/errors.js';
import {
  assertAdmin,
  assertBotPerms,
  assertGuildInteraction,
} from '../../utils/guards.js';
import { logger } from '../../utils/logger.js';
import { getMissingBotPermissionsNamed } from '../../utils/permissions.js';
import { getRequestId } from '../../utils/requestContext.js';
import { sendSetupExport } from './export.js';
import { buildSetupStatusEmbed } from './status.js';

function toSnowflakeBigInt(id: string): bigint {
  return BigInt(id);
}

async function ensureGuildChannelsCached(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    throw new ValidationError('Guild context is missing.');
  }

  await interaction.guild.channels.fetch();
}

function pickNewest<T extends GuildBasedChannel>(
  channels: T[],
  reason: string,
): T | null {
  if (channels.length === 0) {
    return null;
  }

  const sorted = [...channels].sort((a, b) =>
    toSnowflakeBigInt(b.id) > toSnowflakeBigInt(a.id) ? 1 : -1,
  );

  if (sorted.length > 1) {
    logger.warn(
      { reason, total: sorted.length, ids: sorted.map((channel) => channel.id) },
      'Duplicate channels found',
    );
  }

  return sorted[0] ?? null;
}

function getExplicitCategory(
  interaction: ChatInputCommandInteraction,
): CategoryChannel | null {
  if (!interaction.guild) {
    return null;
  }

  const channel = interaction.options.getChannel('category', false);
  if (!channel) {
    return null;
  }

  const resolved = interaction.guild.channels.cache.get(channel.id);
  return resolved?.type === ChannelType.GuildCategory ? resolved : null;
}

function getExplicitLogChannel(
  interaction: ChatInputCommandInteraction,
): TextChannel | null {
  if (!interaction.guild) {
    return null;
  }

  const channel = interaction.options.getChannel('logchannel', false);
  if (!channel) {
    return null;
  }

  const resolved = interaction.guild.channels.cache.get(channel.id);
  return resolved?.type === ChannelType.GuildText ? resolved : null;
}

function getExplicitLobbyChannel(
  interaction: ChatInputCommandInteraction,
): VoiceChannel | null {
  if (!interaction.guild) {
    return null;
  }

  const channel = interaction.options.getChannel('jtclobby', false);
  if (!channel) {
    return null;
  }

  const resolved = interaction.guild.channels.cache.get(channel.id);
  return resolved?.type === ChannelType.GuildVoice ? resolved : null;
}

async function resolveCategory(
  interaction: ChatInputCommandInteraction,
  createCategory: boolean,
): Promise<CategoryChannel> {
  if (!interaction.guild) {
    throw new ValidationError('Guild context is missing.');
  }

  await ensureGuildChannelsCached(interaction);
  const settings = await getGuildSettings(interaction.guild.id);

  if (!createCategory) {
    const explicit = getExplicitCategory(interaction);
    if (!explicit) {
      throw new ValidationError('Category must be provided when createCategory is false.');
    }

    return explicit;
  }

  if (settings?.categoryId) {
    const configured = interaction.guild.channels.cache.get(settings.categoryId);
    if (configured?.type === ChannelType.GuildCategory) {
      return configured;
    }
  }

  const byName = interaction.guild.channels.cache
    .filter(
      (channel): channel is CategoryChannel =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === ChannelNames.CATEGORY,
    )
    .map((channel) => channel);

  const newest = pickNewest(byName, 'wizard-category-by-name');
  if (newest) {
    return newest;
  }

  return interaction.guild.channels.create({
    name: ChannelNames.CATEGORY,
    type: ChannelType.GuildCategory,
    reason: 'AURA Rooms setup wizard',
  });
}

async function resolveLogChannel(
  interaction: ChatInputCommandInteraction,
  createLogChannel: boolean,
  category: CategoryChannel,
): Promise<TextChannel> {
  if (!interaction.guild) {
    throw new ValidationError('Guild context is missing.');
  }

  await ensureGuildChannelsCached(interaction);
  const settings = await getGuildSettings(interaction.guild.id);

  if (!createLogChannel) {
    const explicit = getExplicitLogChannel(interaction);
    if (!explicit) {
      throw new ValidationError('Log channel must be provided when createLogChannel is false.');
    }
    return explicit;
  }

  if (settings?.logChannelId) {
    const configured = interaction.guild.channels.cache.get(settings.logChannelId);
    if (configured?.type === ChannelType.GuildText && configured.parentId === category.id) {
      return configured;
    }
  }

  const candidates = interaction.guild.channels.cache
    .filter(
      (channel): channel is TextChannel =>
        channel.type === ChannelType.GuildText &&
        channel.name === ChannelNames.LOG &&
        channel.parentId === category.id,
    )
    .map((channel) => channel);

  const newest = pickNewest(candidates, 'wizard-log-by-name');
  if (newest) {
    return newest;
  }

  return interaction.guild.channels.create({
    name: ChannelNames.LOG,
    type: ChannelType.GuildText,
    parent: category.id,
    reason: 'AURA Rooms setup wizard',
  });
}

async function resolveLobbyChannel(
  interaction: ChatInputCommandInteraction,
  createJtcLobby: boolean,
  category: CategoryChannel,
): Promise<VoiceChannel> {
  if (!interaction.guild) {
    throw new ValidationError('Guild context is missing.');
  }

  await ensureGuildChannelsCached(interaction);

  if (!createJtcLobby) {
    const explicit = getExplicitLobbyChannel(interaction);
    if (!explicit) {
      throw new ValidationError('JTC lobby must be provided when createJtcLobby is false.');
    }
    return explicit;
  }

  const candidates = interaction.guild.channels.cache
    .filter(
      (channel): channel is VoiceChannel =>
        channel.type === ChannelType.GuildVoice &&
        channel.name === ChannelNames.LOBBY &&
        channel.parentId === category.id,
    )
    .map((channel) => channel);

  const newest = pickNewest(candidates, 'wizard-lobby-by-name');
  if (newest) {
    return newest;
  }

  return interaction.guild.channels.create({
    name: ChannelNames.LOBBY,
    type: ChannelType.GuildVoice,
    parent: category.id,
    reason: 'AURA Rooms setup wizard',
  });
}

export async function handleSetupWizard(
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> {
  const { member } = assertGuildInteraction(interaction);
  assertAdmin(interaction);
  assertBotPerms(member, [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.MoveMembers,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.Connect,
  ]);

  if (!interaction.guild) {
    throw new ValidationError('Guild context is missing.');
  }

  const missing = getMissingBotPermissionsNamed(interaction.guild);
  if (missing.length > 0) {
    await interaction.reply({
      embeds: [
        createErrorEmbed(
          'Missing Bot Permissions',
          `The bot is missing: ${missing.join(', ')}`,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const createCategory = interaction.options.getBoolean('createcategory') ?? true;
  const createLogChannel = interaction.options.getBoolean('createlogchannel') ?? true;
  const createJtcLobby = interaction.options.getBoolean('createjtclobby') ?? true;

  const category = await resolveCategory(interaction, createCategory);
  const logChannel = await resolveLogChannel(interaction, createLogChannel, category);
  const lobby = await resolveLobbyChannel(interaction, createJtcLobby, category);

  const defaultPrivacy =
    (interaction.options.getString('defaultprivacy') as PrivacyMode | null) ??
    Defaults.PRIVACY;
  const defaultUserLimit =
    interaction.options.getInteger('defaultuserlimit') ?? Defaults.USER_LIMIT;
  const nameTemplate =
    interaction.options.getString('nametemplate') ?? Defaults.NAME_TEMPLATE;
  const emptyDeleteSeconds =
    interaction.options.getInteger('emptydeleteseconds') ??
    Defaults.EMPTY_DELETE_SECONDS;
  const createCooldownSeconds =
    interaction.options.getInteger('createcooldownseconds') ??
    Defaults.CREATE_COOLDOWN_SECONDS;
  const maxRoomsPerUser =
    interaction.options.getInteger('maxroomsperuser') ?? Defaults.MAX_ROOMS_PER_USER;

  const trustedRole = interaction.options.getRole('trustedrole', false) as Role | null;
  const djRole = interaction.options.getRole('djrole', false) as Role | null;

  const settings = await upsertWizard(interaction.guild.id, {
    categoryId: category.id,
    logChannelId: logChannel.id,
    defaultTemplate: nameTemplate,
    defaultPrivacy,
    defaultUserLimit,
    emptyDeleteSeconds,
    createCooldownSeconds,
    maxRoomsPerUser,
    trustedRoleIds: trustedRole ? [trustedRole.id] : [],
    djRoleId: djRole?.id,
    setupCompletedAt: new Date(),
  });

  await addLobby(interaction.guild.id, lobby.id);

  await interaction.editReply({
    embeds: [
      createSuccessEmbed('Setup Wizard Completed', 'AURA Rooms setup has been applied.', [
        { name: 'Category', value: `<#${category.id}>`, inline: true },
        { name: 'Log Channel', value: `<#${logChannel.id}>`, inline: true },
        { name: 'JTC Lobby', value: `<#${lobby.id}>`, inline: true },
        { name: 'Default Template', value: settings.defaultTemplate, inline: false },
        { name: 'Default Privacy', value: settings.defaultPrivacy, inline: true },
        {
          name: 'Default User Limit',
          value: String(settings.defaultUserLimit),
          inline: true,
        },
        {
          name: 'Limits',
          value: `maxRooms=${settings.maxRoomsPerUser}, createCooldown=${settings.createCooldownSeconds}s, emptyDelete=${settings.emptyDeleteSeconds}s`,
          inline: false,
        },
        {
          name: 'Trusted Role',
          value: trustedRole ? `<@&${trustedRole.id}>` : 'Unchanged',
          inline: true,
        },
        { name: 'DJ Role', value: djRole ? `<@&${djRole.id}>` : 'Unchanged', inline: true },
      ]),
    ],
    components: [createSetupWizardButtons()],
  });

  await context.auditLogService.logEvent(interaction.guild.id, {
    action: 'setup_wizard',
    result: 'success',
    actorId: interaction.user.id,
    requestId: getRequestId(interaction),
    details: `Wizard configured category=${category.id} log=${logChannel.id} lobby=${lobby.id}`,
  });
}

export const setupWizardButtonHandlers: ButtonHandler[] = [
  {
    customId: ComponentIds.SETUP_VIEW_STATUS,
    async execute(interaction: ButtonInteraction): Promise<void> {
      assertGuildInteraction(interaction);

      if (!interaction.guild) {
        throw new ValidationError('Guild context missing.');
      }

      const embed = await buildSetupStatusEmbed(interaction.guild);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    },
  },
  {
    customId: ComponentIds.SETUP_EXPORT_CONFIG,
    async execute(interaction: ButtonInteraction, context: AppContext): Promise<void> {
      assertGuildInteraction(interaction);
      assertAdmin(interaction);
      await sendSetupExport(interaction, context);
    },
  },
  {
    customId: ComponentIds.SETUP_OPEN_ROOM_PANEL,
    async execute(interaction: ButtonInteraction): Promise<void> {
      assertGuildInteraction(interaction);
      await interaction.reply({
        embeds: [
          createSuccessEmbed(
            'Room Panel',
            'Use `/room panel` while connected to your temp room to open controls.',
          ),
        ],
        ephemeral: true,
      });
    },
  },
];
