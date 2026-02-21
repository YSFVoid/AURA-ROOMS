import { ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import { add, list, remove } from '../../db/repos/lobbyRepo.js';
import type { AppContext } from '../../types/index.js';
import { createErrorEmbed, createInfoEmbed, createSuccessEmbed } from '../../ui/embeds.js';

export async function handleSetupJtcAdd(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup JTC', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('channel', true);
  if (channel.type !== ChannelType.GuildVoice) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup JTC', 'Please provide a voice channel.')],
      ephemeral: true,
    });
    return;
  }

  await add(interaction.guildId, channel.id);

  await interaction.reply({
    embeds: [createSuccessEmbed('JTC Added', `${channel.toString()} added as create room lobby.`)],
    ephemeral: true,
  });
}

export async function handleSetupJtcRemove(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup JTC', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('channel', true);
  if (channel.type !== ChannelType.GuildVoice) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup JTC', 'Please provide a voice channel.')],
      ephemeral: true,
    });
    return;
  }

  const removed = await remove(interaction.guildId, channel.id);

  await interaction.reply({
    embeds: [
      createSuccessEmbed(
        'JTC Remove',
        removed ? `${channel.toString()} removed from JTC lobbies.` : 'Lobby was not configured.',
      ),
    ],
    ephemeral: true,
  });
}

export async function handleSetupJtcList(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Setup JTC', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const lobbies = await list(interaction.guildId);

  await interaction.reply({
    embeds: [
      createInfoEmbed(
        'JTC Lobbies',
        lobbies.length > 0
          ? lobbies.map((lobby) => `<#${lobby.lobbyChannelId}>`).join('\n')
          : 'No JTC lobbies configured.',
      ),
    ],
    ephemeral: true,
  });
}
