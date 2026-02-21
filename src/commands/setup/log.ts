import type { ChatInputCommandInteraction } from 'discord.js';
import { ChannelType } from 'discord.js';
import { setLog } from '../../db/repos/guildSettingsRepo.js';
import type { AppContext } from '../../types/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';

export async function handleSetupLogSet(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Log', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const logChannel = interaction.options.getChannel('channel', true);
  if (logChannel.type !== ChannelType.GuildText) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup Log', 'Please provide a text channel.')],
      ephemeral: true,
    });
    return;
  }

  await setLog(interaction.guildId, logChannel.id);

  await interaction.reply({
    embeds: [createSuccessEmbed('Setup Log', `Log channel set to ${logChannel.toString()}.`)],
    ephemeral: true,
  });
}
