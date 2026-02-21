import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import { ComponentIds, Defaults } from '../../config/constants.js';
import type { AppContext, ButtonHandler } from '../../types/index.js';
import { createPaginationButtons } from '../../ui/components.js';
import { createErrorEmbed, createInfoEmbed } from '../../ui/embeds.js';
import { paginate, parseFooterPage } from '../../ui/pagination.js';

function templateLines(items: Array<{ name: string; privacyMode: string; userLimit: number }>): string {
  if (items.length === 0) {
    return 'No templates saved.';
  }

  return items
    .map((item, index) => `${index + 1}. **${item.name}** • ${item.privacyMode} • limit ${item.userLimit}`)
    .join('\n');
}

async function buildTemplateListResponse(context: AppContext, guildId: string, userId: string, page: number) {
  const templates = await context.templateService.listTemplates(guildId, userId);
  const paged = paginate(templates, page, Defaults.TEMPLATE_PAGE_SIZE);

  const embed = createInfoEmbed('Templates', templateLines(paged.items)).setFooter({
    text: `YSF • Lone wolf developer • Page ${paged.page}/${paged.totalPages}`,
  });

  return {
    embeds: [embed],
    components: [createPaginationButtons(paged.page, paged.totalPages)],
  };
}

export async function handleTemplateList(
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed('Template List', 'Guild context is missing.')],
      ephemeral: true,
    });
    return;
  }

  const response = await buildTemplateListResponse(context, interaction.guildId, interaction.user.id, 1);
  await interaction.reply({ ...response, ephemeral: true });
}

export const templateListButtonHandlers: ButtonHandler[] = [
  {
    customId: ComponentIds.TEMPLATE_LIST_PREV,
    async execute(interaction: ButtonInteraction, context: AppContext): Promise<void> {
      if (!interaction.guildId) {
        await interaction.reply({
          embeds: [createErrorEmbed('Template List', 'Guild context is missing.')],
          ephemeral: true,
        });
        return;
      }

      const footer = interaction.message.embeds[0]?.footer?.text;
      const { page } = parseFooterPage(footer);
      const response = await buildTemplateListResponse(context, interaction.guildId, interaction.user.id, page - 1);
      await interaction.update(response);
    },
  },
  {
    customId: ComponentIds.TEMPLATE_LIST_NEXT,
    async execute(interaction: ButtonInteraction, context: AppContext): Promise<void> {
      if (!interaction.guildId) {
        await interaction.reply({
          embeds: [createErrorEmbed('Template List', 'Guild context is missing.')],
          ephemeral: true,
        });
        return;
      }

      const footer = interaction.message.embeds[0]?.footer?.text;
      const { page } = parseFooterPage(footer);
      const response = await buildTemplateListResponse(context, interaction.guildId, interaction.user.id, page + 1);
      await interaction.update(response);
    },
  },
];
