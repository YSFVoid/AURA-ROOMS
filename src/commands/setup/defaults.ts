import type { ChatInputCommandInteraction } from 'discord.js';
import { Defaults, type PrivacyMode } from '../../config/constants.js';
import { ensureDefaults, setDefaults } from '../../db/repos/guildSettingsRepo.js';
import type { AppContext } from '../../types/index.js';
import { createErrorEmbed, createInfoEmbed, createSuccessEmbed } from '../../ui/embeds.js';

export async function handleSetupDefaultsSet(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Defaults', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const template = interaction.options.getString('nametemplate') ?? Defaults.NAME_TEMPLATE;
  const privacy =
    (interaction.options.getString('defaultprivacy') as PrivacyMode | null) ?? Defaults.PRIVACY;
  const userLimit = interaction.options.getInteger('defaultuserlimit') ?? Defaults.USER_LIMIT;

  const settings = await setDefaults(interaction.guildId, {
    defaultTemplate: template,
    defaultPrivacy: privacy,
    defaultUserLimit: userLimit,
  });

  await interaction.reply({
    embeds: [
      createSuccessEmbed('Setup Defaults Updated', 'Defaults were saved.', [
        { name: 'Template', value: settings.defaultTemplate, inline: false },
        { name: 'Privacy', value: settings.defaultPrivacy, inline: true },
        { name: 'User Limit', value: String(settings.defaultUserLimit), inline: true },
      ]),
    ],
    ephemeral: true,
  });
}

export async function handleSetupDefaultsView(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Defaults', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const settings = await ensureDefaults(interaction.guildId);

  await interaction.reply({
    embeds: [
      createInfoEmbed('Setup Defaults', 'Current default values.', [
        { name: 'Template', value: settings.defaultTemplate, inline: false },
        { name: 'Privacy', value: settings.defaultPrivacy, inline: true },
        { name: 'User Limit', value: String(settings.defaultUserLimit), inline: true },
      ]),
    ],
    ephemeral: true,
  });
}
