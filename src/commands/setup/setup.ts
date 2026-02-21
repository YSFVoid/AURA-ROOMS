import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { PrivacyModes } from '../../config/constants.js';
import type { SlashCommandModule } from '../../types/index.js';
import { createErrorEmbed } from '../../ui/embeds.js';
import { handleSetupCategorySet } from './category.js';
import { handleSetupDefaultsSet, handleSetupDefaultsView } from './defaults.js';
import { handleSetupExport } from './export.js';
import { handleSetupImport } from './import.js';
import { handleSetupJtcAdd, handleSetupJtcList, handleSetupJtcRemove } from './jtc.js';
import { handleSetupLimitsSet, handleSetupLimitsView } from './limits.js';
import { handleSetupLogSet } from './log.js';
import { handleSetupStatus } from './status.js';
import { handleSetupWizard } from './wizard.js';

export const setupCommand: SlashCommandModule = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure AURA Rooms')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Show setup status'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('wizard')
        .setDescription('Run one-step setup wizard')
        .addBooleanOption((option) =>
          option
            .setName('createcategory')
            .setDescription('Create or reuse category automatically'),
        )
        .addBooleanOption((option) =>
          option
            .setName('createlogchannel')
            .setDescription('Create or reuse log channel automatically'),
        )
        .addBooleanOption((option) =>
          option
            .setName('createjtclobby')
            .setDescription('Create or reuse JTC lobby automatically'),
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Use this category when createCategory is false')
            .addChannelTypes(4),
        )
        .addChannelOption((option) =>
          option
            .setName('logchannel')
            .setDescription('Use this text channel when createLogChannel is false')
            .addChannelTypes(0),
        )
        .addChannelOption((option) =>
          option
            .setName('jtclobby')
            .setDescription('Use this voice channel when createJtcLobby is false')
            .addChannelTypes(2),
        )
        .addStringOption((option) =>
          option
            .setName('defaultprivacy')
            .setDescription('Default room privacy')
            .addChoices(...PrivacyModes.map((mode) => ({ name: mode, value: mode }))),
        )
        .addIntegerOption((option) =>
          option
            .setName('defaultuserlimit')
            .setDescription('Default room user limit (0-99)')
            .setMinValue(0)
            .setMaxValue(99),
        )
        .addStringOption((option) =>
          option
            .setName('nametemplate')
            .setDescription("Name template. Example: {displayName}'s room")
            .setMaxLength(100),
        )
        .addIntegerOption((option) =>
          option
            .setName('emptydeleteseconds')
            .setDescription('Delete delay when a room becomes empty')
            .setMinValue(5)
            .setMaxValue(3600),
        )
        .addIntegerOption((option) =>
          option
            .setName('createcooldownseconds')
            .setDescription('Cooldown between room creations')
            .setMinValue(0)
            .setMaxValue(3600),
        )
        .addIntegerOption((option) =>
          option
            .setName('maxroomsperuser')
            .setDescription('Maximum active rooms per user')
            .setMinValue(1)
            .setMaxValue(10),
        )
        .addRoleOption((option) =>
          option
            .setName('trustedrole')
            .setDescription('Trusted role for room management access'),
        )
        .addRoleOption((option) =>
          option
            .setName('djrole')
            .setDescription('DJ role reserved for future music features'),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('jtc')
        .setDescription('Manage create-room lobby channels')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('add')
            .setDescription('Add a JTC lobby channel')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Voice channel')
                .setRequired(true)
                .addChannelTypes(2),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('remove')
            .setDescription('Remove a JTC lobby channel')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Voice channel')
                .setRequired(true)
                .addChannelTypes(2),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('list').setDescription('List configured JTC lobbies'),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('category')
        .setDescription('Manage setup category')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('set')
            .setDescription('Set category for temp rooms')
            .addChannelOption((option) =>
              option
                .setName('category')
                .setDescription('Category channel')
                .setRequired(true)
                .addChannelTypes(4),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('log')
        .setDescription('Manage audit log channel')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('set')
            .setDescription('Set log channel')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Text channel')
                .setRequired(true)
                .addChannelTypes(0),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('defaults')
        .setDescription('Manage default room settings')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('set')
            .setDescription('Set default room values')
            .addStringOption((option) =>
              option
                .setName('nametemplate')
                .setDescription("Template for room names")
                .setRequired(true)
                .setMaxLength(100),
            )
            .addStringOption((option) =>
              option
                .setName('defaultprivacy')
                .setDescription('Default privacy mode')
                .setRequired(true)
                .addChoices(...PrivacyModes.map((mode) => ({ name: mode, value: mode }))),
            )
            .addIntegerOption((option) =>
              option
                .setName('defaultuserlimit')
                .setDescription('Default user limit (0-99)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(99),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('view').setDescription('View default room values'),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('limits')
        .setDescription('Manage anti-abuse and cleanup limits')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('set')
            .setDescription('Set anti-abuse and cleanup limits')
            .addIntegerOption((option) =>
              option
                .setName('maxroomsperuser')
                .setDescription('Maximum active rooms per user')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10),
            )
            .addIntegerOption((option) =>
              option
                .setName('createcooldownseconds')
                .setDescription('Room creation cooldown in seconds')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(3600),
            )
            .addIntegerOption((option) =>
              option
                .setName('emptydeleteseconds')
                .setDescription('Delete empty room after seconds')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(3600),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('view').setDescription('View current limits'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('export').setDescription('Export configuration as JSON'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('import')
        .setDescription('Import configuration from JSON')
        .addAttachmentOption((option) =>
          option
            .setName('file')
            .setDescription('Config JSON file. If omitted, a modal opens.'),
        ),
    ),

  async execute(interaction, context) {
    if (!interaction.inGuild() || !interaction.memberPermissions) {
      await interaction.reply({
        embeds: [createErrorEmbed('Setup', 'This command can only be used inside a server.')],
        ephemeral: true,
      });
      return;
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [createErrorEmbed('Setup', 'Administrator permission is required.')],
        ephemeral: true,
      });
      return;
    }

    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (!group && subcommand === 'status') {
      await handleSetupStatus(interaction, context);
      return;
    }

    if (!group && subcommand === 'wizard') {
      await handleSetupWizard(interaction, context);
      return;
    }

    if (group === 'jtc' && subcommand === 'add') {
      await handleSetupJtcAdd(interaction, context);
      return;
    }

    if (group === 'jtc' && subcommand === 'remove') {
      await handleSetupJtcRemove(interaction, context);
      return;
    }

    if (group === 'jtc' && subcommand === 'list') {
      await handleSetupJtcList(interaction, context);
      return;
    }

    if (group === 'category' && subcommand === 'set') {
      await handleSetupCategorySet(interaction, context);
      return;
    }

    if (group === 'log' && subcommand === 'set') {
      await handleSetupLogSet(interaction, context);
      return;
    }

    if (group === 'defaults' && subcommand === 'set') {
      await handleSetupDefaultsSet(interaction, context);
      return;
    }

    if (group === 'defaults' && subcommand === 'view') {
      await handleSetupDefaultsView(interaction, context);
      return;
    }

    if (group === 'limits' && subcommand === 'set') {
      await handleSetupLimitsSet(interaction, context);
      return;
    }

    if (group === 'limits' && subcommand === 'view') {
      await handleSetupLimitsView(interaction, context);
      return;
    }

    if (!group && subcommand === 'export') {
      await handleSetupExport(interaction, context);
      return;
    }

    if (!group && subcommand === 'import') {
      await handleSetupImport(interaction, context);
      return;
    }

    await interaction.reply({
      embeds: [createErrorEmbed('Setup', 'Unknown setup subcommand.')],
      ephemeral: true,
    });
  },
};
