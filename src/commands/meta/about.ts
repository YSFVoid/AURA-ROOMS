import { SlashCommandBuilder } from 'discord.js';
import { Branding } from '../../config/constants.js';
import type { SlashCommandModule } from '../../types/index.js';
import { formatUptime } from '../../utils/format.js';
import { getVersion } from '../../utils/version.js';
import { createInfoEmbed } from '../../ui/embeds.js';

export const aboutCommand: SlashCommandModule = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Show bot info and credits'),

  async execute(interaction, context) {
    const uptime = formatUptime(Date.now() - context.startedAt);

    const embed = createInfoEmbed(Branding.NAME, Branding.DESCRIPTION, [
      { name: 'Developer', value: Branding.DEVELOPER, inline: true },
      { name: 'Version', value: getVersion(), inline: true },
      { name: 'Uptime', value: uptime, inline: true },
      { name: 'Servers', value: String(context.client.guilds.cache.size), inline: true },
    ]).setFooter({ text: Branding.ABOUT_FOOTER });

    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
