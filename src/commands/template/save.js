import { SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { handleTemplateApply } from './apply.js';
import { handleTemplateDelete } from './delete.js';
import { handleTemplateEdit } from './edit.js';
import { handleTemplateList } from './list.js';

export const templateCommand = {
    data: new SlashCommandBuilder()
        .setName('template')
        .setDescription('Manage personal room templates')
        .addSubcommand((sub) =>
            sub.setName('save').setDescription('Save a template')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32))
                .addStringOption((o) => o.setName('nametemplate').setDescription('Room name template').setRequired(true).setMaxLength(100))
                .addStringOption((o) => o.setName('privacy').setDescription('Privacy mode').setRequired(true)
                    .addChoices({ name: 'public', value: 'public' }, { name: 'locked', value: 'locked' }, { name: 'private', value: 'private' }))
                .addIntegerOption((o) => o.setName('userlimit').setDescription('User limit').setRequired(true).setMinValue(0).setMaxValue(99))
                .addStringOption((o) => o.setName('activity').setDescription('Activity tag').setMaxLength(100))
                .addBooleanOption((o) => o.setName('autoname').setDescription('Auto name enabled')),
        )
        .addSubcommand((sub) =>
            sub.setName('edit').setDescription('Edit an existing template')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32))
                .addStringOption((o) => o.setName('nametemplate').setDescription('Room name template').setMaxLength(100))
                .addStringOption((o) => o.setName('privacy').setDescription('Privacy mode')
                    .addChoices({ name: 'public', value: 'public' }, { name: 'locked', value: 'locked' }, { name: 'private', value: 'private' }))
                .addIntegerOption((o) => o.setName('userlimit').setDescription('User limit').setMinValue(0).setMaxValue(99))
                .addStringOption((o) => o.setName('activity').setDescription('Activity tag').setMaxLength(100))
                .addBooleanOption((o) => o.setName('autoname').setDescription('Auto name enabled')),
        )
        .addSubcommand((sub) =>
            sub.setName('delete').setDescription('Delete a template')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32)),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('List saved templates'))
        .addSubcommand((sub) =>
            sub.setName('apply').setDescription('Apply a template to your current temp room')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32)),
        ),

    async execute(interaction, context) {
        if (!interaction.guildId) {
            await interaction.reply({ embeds: [createErrorEmbed('Template', 'This command must be used in a server.')], ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'save') {
            const name = interaction.options.getString('name', true).trim();
            const nameTemplate = interaction.options.getString('nametemplate', true).trim();
            const privacyMode = interaction.options.getString('privacy', true);
            const userLimit = interaction.options.getInteger('userlimit', true);
            const activityTag = interaction.options.getString('activity') ?? undefined;
            const autoNameEnabled = interaction.options.getBoolean('autoname') ?? true;

            await context.templateService.saveTemplate({
                guildId: interaction.guildId, ownerId: interaction.user.id,
                name, nameTemplate, privacyMode, userLimit, activityTag, autoNameEnabled,
                allowedRoleIds: [], deniedRoleIds: [],
            });

            await interaction.reply({ embeds: [createSuccessEmbed('Template Saved', `Template **${name}** saved.`)], ephemeral: true });
            return;
        }

        if (subcommand === 'edit') { await handleTemplateEdit(interaction, context); return; }
        if (subcommand === 'delete') { await handleTemplateDelete(interaction, context); return; }
        if (subcommand === 'list') { await handleTemplateList(interaction, context); return; }
        if (subcommand === 'apply') { await handleTemplateApply(interaction, context); return; }

        await interaction.reply({ embeds: [createErrorEmbed('Template', 'Unknown template action.')], ephemeral: true });
    },
};
