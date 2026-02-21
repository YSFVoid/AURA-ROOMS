import type { ChatInputCommandInteraction, Guild } from 'discord.js';
import { list as listLobbies } from '../../db/repos/lobbyRepo.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import type { AppContext } from '../../types/index.js';
import { createInfoEmbed } from '../../ui/embeds.js';
import { formatAbsoluteTimestamp } from '../../utils/format.js';
import { getMissingBotPermissionsNamed } from '../../utils/permissions.js';

export async function buildSetupStatusEmbed(guild: Guild) {
  const settings = await ensureDefaults(guild.id);
  const lobbies = await listLobbies(guild.id);
  const missing = getMissingBotPermissionsNamed(guild);

  const health = missing.length === 0 && lobbies.length > 0 ? 'Healthy' : 'Needs attention';

  const embed = createInfoEmbed('Setup Status', `Configuration for **${guild.name}**`, [
    { name: 'Category', value: settings.categoryId ? `<#${settings.categoryId}>` : 'Not set', inline: true },
    { name: 'Log Channel', value: settings.logChannelId ? `<#${settings.logChannelId}>` : 'Not set', inline: true },
    {
      name: 'JTC Lobbies',
      value: lobbies.length > 0 ? lobbies.map((x) => `<#${x.lobbyChannelId}>`).join(', ') : 'None',
      inline: false,
    },
    { name: 'Default Template', value: settings.defaultTemplate, inline: false },
    { name: 'Default Privacy', value: settings.defaultPrivacy, inline: true },
    { name: 'Default User Limit', value: String(settings.defaultUserLimit), inline: true },
    { name: 'Max Rooms / User', value: String(settings.maxRoomsPerUser), inline: true },
    { name: 'Create Cooldown', value: `${settings.createCooldownSeconds}s`, inline: true },
    { name: 'Empty Delete', value: `${settings.emptyDeleteSeconds}s`, inline: true },
    {
      name: 'Setup Completed',
      value: settings.setupCompletedAt ? formatAbsoluteTimestamp(settings.setupCompletedAt) : 'Not set',
      inline: true,
    },
    {
      name: 'Missing Bot Permissions',
      value: missing.length === 0 ? 'None' : missing.join(', '),
      inline: false,
    },
    { name: 'Health', value: health, inline: true },
  ]);

  return embed;
}

export async function handleSetupStatus(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      embeds: [createInfoEmbed('Setup Status', 'This command can only be used in a server.')],
      ephemeral: true,
    });
    return;
  }

  const embed = await buildSetupStatusEmbed(interaction.guild);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
