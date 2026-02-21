import type { ChatInputCommandInteraction } from 'discord.js';
import { ChannelType } from 'discord.js';
import { setCategory } from '../../db/repos/guildSettingsRepo.js';
import type { AppContext } from '../../types/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';

export async function handleSetupCategorySet(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Category', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const category = interaction.options.getChannel('category', true);
  if (category.type !== ChannelType.GuildCategory) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Category', 'Please provide a category channel.')],
      ephemeral: true,
    });
    return;
  }

  await setCategory(interaction.guildId, category.id);

  await interaction.reply({
    embeds: [createSuccessEmbed('Setup Category', `Category set to ${category.toString()}.`)],
    ephemeral: true,
  });
}
