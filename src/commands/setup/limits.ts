import type { ChatInputCommandInteraction } from 'discord.js';
import { Defaults } from '../../config/constants.js';
import { ensureDefaults, setLimits } from '../../db/repos/guildSettingsRepo.js';
import type { AppContext } from '../../types/index.js';
import { createErrorEmbed, createInfoEmbed, createSuccessEmbed } from '../../ui/embeds.js';

export async function handleSetupLimitsSet(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Limits', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const maxRoomsPerUser = interaction.options.getInteger('maxroomsperuser') ?? Defaults.MAX_ROOMS_PER_USER;
  const createCooldownSeconds =
    interaction.options.getInteger('createcooldownseconds') ?? Defaults.CREATE_COOLDOWN_SECONDS;
  const emptyDeleteSeconds =
    interaction.options.getInteger('emptydeleteseconds') ?? Defaults.EMPTY_DELETE_SECONDS;

  const settings = await setLimits(interaction.guildId, {
    maxRoomsPerUser,
    createCooldownSeconds,
    emptyDeleteSeconds,
  });

  await interaction.reply({
    embeds: [
      createSuccessEmbed('Setup Limits Updated', 'Limits were saved.', [
        { name: 'Max Rooms / User', value: String(settings.maxRoomsPerUser), inline: true },
        { name: 'Create Cooldown', value: `${settings.createCooldownSeconds}s`, inline: true },
        { name: 'Empty Delete', value: `${settings.emptyDeleteSeconds}s`, inline: true },
      ]),
    ],
    ephemeral: true,
  });
}

export async function handleSetupLimitsView(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Limits', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const settings = await ensureDefaults(interaction.guildId);

  await interaction.reply({
    embeds: [
      createInfoEmbed('Setup Limits', 'Current anti-abuse and cleanup limits.', [
        { name: 'Max Rooms / User', value: String(settings.maxRoomsPerUser), inline: true },
        { name: 'Create Cooldown', value: `${settings.createCooldownSeconds}s`, inline: true },
        { name: 'Empty Delete', value: `${settings.emptyDeleteSeconds}s`, inline: true },
      ]),
    ],
    ephemeral: true,
  });
}
