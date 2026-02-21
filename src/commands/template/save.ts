import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommandModule } from '../../types/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { handleTemplateApply } from './apply.js';
import { handleTemplateDelete } from './delete.js';
import { handleTemplateEdit } from './edit.js';
import { handleTemplateList } from './list.js';

export const templateCommand: SlashCommandModule = {
  data: new SlashCommandBuilder()
    .setName('template')
    .setDescription('Manage personal room templates')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('save')
        .setDescription('Save a template')
        .addStringOption((option) =>
          option.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32),
        )
        .addStringOption((option) =>
          option
            .setName('nametemplate')
            .setDescription('Room name template')
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName('privacy')
            .setDescription('Privacy mode')
            .setRequired(true)
            .addChoices(
              { name: 'public', value: 'public' },
              { name: 'locked', value: 'locked' },
              { name: 'private', value: 'private' },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName('userlimit')
            .setDescription('User limit')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99),
        )
        .addStringOption((option) =>
          option.setName('activity').setDescription('Activity tag').setMaxLength(100),
        )
        .addBooleanOption((option) =>
          option.setName('autoname').setDescription('Auto name enabled'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edit an existing template')
        .addStringOption((option) =>
          option.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32),
        )
        .addStringOption((option) =>
          option
            .setName('nametemplate')
            .setDescription('Room name template')
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName('privacy')
            .setDescription('Privacy mode')
            .addChoices(
              { name: 'public', value: 'public' },
              { name: 'locked', value: 'locked' },
              { name: 'private', value: 'private' },
            ),
        )
        .addIntegerOption((option) =>
          option.setName('userlimit').setDescription('User limit').setMinValue(0).setMaxValue(99),
        )
        .addStringOption((option) =>
          option.setName('activity').setDescription('Activity tag').setMaxLength(100),
        )
        .addBooleanOption((option) =>
          option.setName('autoname').setDescription('Auto name enabled'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a template')
        .addStringOption((option) =>
          option.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('List saved templates'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('apply')
        .setDescription('Apply a template to your current temp room')
        .addStringOption((option) =>
          option.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32),
        ),
    ),

  async execute(interaction, context) {
    if (!interaction.guildId) {
      await interaction.reply({
        embeds: [createErrorEmbed('Template', 'This command must be used in a server.')],
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'save') {
      const name = interaction.options.getString('name', true).trim();
      const nameTemplate = interaction.options.getString('nametemplate', true).trim();
      const privacyMode = interaction.options.getString('privacy', true) as 'public' | 'locked' | 'private';
      const userLimit = interaction.options.getInteger('userlimit', true);
      const activityTag = interaction.options.getString('activity') ?? undefined;
      const autoNameEnabled = interaction.options.getBoolean('autoname') ?? true;

      await context.templateService.saveTemplate({
        guildId: interaction.guildId,
        ownerId: interaction.user.id,
        name,
        nameTemplate,
        privacyMode,
        userLimit,
        activityTag,
        autoNameEnabled,
        allowedRoleIds: [],
        deniedRoleIds: [],
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Template Saved', `Template **${name}** saved.`)],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'edit') {
      await handleTemplateEdit(interaction, context);
      return;
    }

    if (subcommand === 'delete') {
      await handleTemplateDelete(interaction, context);
      return;
    }

    if (subcommand === 'list') {
      await handleTemplateList(interaction, context);
      return;
    }

    if (subcommand === 'apply') {
      await handleTemplateApply(interaction, context);
      return;
    }

    await interaction.reply({
      embeds: [createErrorEmbed('Template', 'Unknown template action.')],
      ephemeral: true,
    });
  },
};
