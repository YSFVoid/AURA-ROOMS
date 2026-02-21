import type { ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../types/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';

export async function handleTemplateEdit(
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Template Edit', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const name = interaction.options.getString('name', true);
  const patch = {
    nameTemplate: interaction.options.getString('nametemplate') ?? undefined,
    privacyMode: (interaction.options.getString('privacy') as 'public' | 'locked' | 'private' | null) ?? undefined,
    userLimit: interaction.options.getInteger('userlimit') ?? undefined,
    activityTag: interaction.options.getString('activity') ?? undefined,
    autoNameEnabled: interaction.options.getBoolean('autoname') ?? undefined,
  };

  const updated = await context.templateService.editTemplate(
    interaction.guildId,
    interaction.user.id,
    name,
    patch,
  );

  await interaction.reply({
    embeds: [
      createSuccessEmbed(
        'Template Edit',
        updated ? `Template **${name}** updated.` : 'Template not found.',
      ),
    ],
    ephemeral: true,
  });
}
