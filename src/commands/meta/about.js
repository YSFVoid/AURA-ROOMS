import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { Branding, Colors } from '../../config/constants.js';
import { getVersion } from '../../utils/version.js';

export const aboutCommand = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription('About AURA Rooms'),

    async execute(interaction) {
        const version = getVersion();

        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(Branding.NAME)
            .setDescription(Branding.DESCRIPTION)
            .addFields(
                { name: 'Version', value: version, inline: true },
                { name: 'Library', value: 'discord.js v14', inline: true },
                { name: 'Runtime', value: `Node.js ${process.version}`, inline: true },
            )
            .setFooter({ text: Branding.ABOUT_FOOTER })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
