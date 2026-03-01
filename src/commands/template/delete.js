import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';

export async function handleTemplateDelete(interaction, context) {
    if (!interaction.guildId) {
        await interaction.reply({ embeds: [createErrorEmbed('Template Delete', 'Guild context is missing.')], ephemeral: true });
        return;
    }

    const name = interaction.options.getString('name', true);
    const removed = await context.templateService.deleteTemplate(interaction.guildId, interaction.user.id, name);

    await interaction.reply({
        embeds: [createSuccessEmbed('Template Delete', removed ? `Deleted template **${name}**.` : 'Template not found.')],
        ephemeral: true,
    });
}
