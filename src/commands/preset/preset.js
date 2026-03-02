import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { SafeLimits } from '../../config/safeLimits.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import {
    createPreset,
    updatePreset,
    deletePreset,
    listPresets,
    getPreset,
    countPresets,
} from '../../db/repos/presetsRepo.js';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../../ui/embeds.js';
import { PurpleOS } from '../../ui/theme.js';

export const presetCommand = {
    data: new SlashCommandBuilder()
        .setName('preset')
        .setDescription('Manage server room presets')
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription('Create a new preset')
                .addStringOption((opt) => opt.setName('name').setDescription('Preset name').setRequired(true).setMaxLength(SafeLimits.MAX_TEMPLATE_NAME_LEN))
                .addStringOption((opt) => opt.setName('privacy').setDescription('Privacy mode').addChoices({ name: 'Public', value: 'public' }, { name: 'Locked', value: 'locked' }, { name: 'Private', value: 'private' }))
                .addIntegerOption((opt) => opt.setName('limit').setDescription('User limit').setMinValue(0).setMaxValue(SafeLimits.MAX_USER_LIMIT)),
        )
        .addSubcommand((sub) =>
            sub
                .setName('edit')
                .setDescription('Edit an existing preset')
                .addStringOption((opt) => opt.setName('name').setDescription('Preset name').setRequired(true))
                .addStringOption((opt) => opt.setName('privacy').setDescription('Privacy mode').addChoices({ name: 'Public', value: 'public' }, { name: 'Locked', value: 'locked' }, { name: 'Private', value: 'private' }))
                .addIntegerOption((opt) => opt.setName('limit').setDescription('User limit').setMinValue(0).setMaxValue(SafeLimits.MAX_USER_LIMIT)),
        )
        .addSubcommand((sub) =>
            sub
                .setName('delete')
                .setDescription('Delete a preset')
                .addStringOption((opt) => opt.setName('name').setDescription('Preset name').setRequired(true)),
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription('List all server presets'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('apply')
                .setDescription('Apply a preset to your current room')
                .addStringOption((opt) => opt.setName('name').setDescription('Preset name').setRequired(true)),
        ),

    async execute(interaction, context) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const settings = await ensureDefaults(guildId);

        if (settings.presetsMode === 'off') {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', 'Presets are disabled on this server.')], ephemeral: true });
            return;
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (settings.presetsMode === 'adminsOnly' && !isAdmin) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', 'Only admins can manage presets.')], ephemeral: true });
            return;
        }

        if (sub === 'create') {
            await presetCommand.handleCreate(interaction, guildId);
        } else if (sub === 'edit') {
            await presetCommand.handleEdit(interaction, guildId, isAdmin);
        } else if (sub === 'delete') {
            await presetCommand.handleDelete(interaction, guildId, isAdmin);
        } else if (sub === 'list') {
            await presetCommand.handleList(interaction, guildId);
        } else if (sub === 'apply') {
            await presetCommand.handleApply(interaction, guildId, context);
        }
    },

    async handleCreate(interaction, guildId) {
        const name = interaction.options.getString('name', true).trim();
        const privacy = interaction.options.getString('privacy') ?? 'locked';
        const limit = interaction.options.getInteger('limit') ?? 0;

        const count = await countPresets(guildId);
        if (count >= SafeLimits.MAX_PRESETS_PER_GUILD) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', `Max ${SafeLimits.MAX_PRESETS_PER_GUILD} presets reached.`)], ephemeral: true });
            return;
        }

        const existing = await getPreset(guildId, name);
        if (existing) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', `Preset "${name}" already exists.`)], ephemeral: true });
            return;
        }

        await createPreset(guildId, name, {
            privacyMode: privacy,
            userLimit: limit,
            createdBy: interaction.user.id,
        });

        await interaction.reply({ embeds: [createSuccessEmbed(`${PurpleOS.Icons.TEMPLATE} Preset Created`, `**${name}** saved.`)], ephemeral: true });
    },

    async handleEdit(interaction, guildId, isAdmin) {
        const name = interaction.options.getString('name', true).trim();
        const existing = await getPreset(guildId, name);
        if (!existing) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', `Preset "${name}" not found.`)], ephemeral: true });
            return;
        }

        if (existing.createdBy !== interaction.user.id && !isAdmin) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', 'You can only edit your own presets.')], ephemeral: true });
            return;
        }

        const updates = {};
        const privacy = interaction.options.getString('privacy');
        const limit = interaction.options.getInteger('limit');
        if (privacy) updates.privacyMode = privacy;
        if (limit !== null) updates.userLimit = limit;

        if (Object.keys(updates).length === 0) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', 'No changes provided.')], ephemeral: true });
            return;
        }

        await updatePreset(guildId, name, updates);
        await interaction.reply({ embeds: [createSuccessEmbed(`${PurpleOS.Icons.TEMPLATE} Preset Updated`, `**${name}** updated.`)], ephemeral: true });
    },

    async handleDelete(interaction, guildId, isAdmin) {
        const name = interaction.options.getString('name', true).trim();
        const existing = await getPreset(guildId, name);
        if (!existing) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', `Preset "${name}" not found.`)], ephemeral: true });
            return;
        }

        if (existing.createdBy !== interaction.user.id && !isAdmin) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', 'You can only delete your own presets.')], ephemeral: true });
            return;
        }

        await deletePreset(guildId, name);
        await interaction.reply({ embeds: [createSuccessEmbed(`${PurpleOS.Icons.TEMPLATE} Preset Deleted`, `**${name}** removed.`)], ephemeral: true });
    },

    async handleList(interaction, guildId) {
        const presets = await listPresets(guildId);
        if (presets.length === 0) {
            await interaction.reply({ embeds: [createInfoEmbed('Server Presets', 'No presets configured.')], ephemeral: true });
            return;
        }

        const lines = presets.map((p, i) => {
            const privacy = p.privacyMode === 'public' ? 'Public' : p.privacyMode === 'locked' ? 'Locked' : 'Private';
            const limit = p.userLimit === 0 ? 'Unlimited' : `${p.userLimit}`;
            return `**${i + 1}.** ${p.name} ${PurpleOS.Icons.DOT} ${privacy} ${PurpleOS.Icons.DOT} Limit ${limit}`;
        });

        await interaction.reply({ embeds: [createInfoEmbed(`${PurpleOS.Icons.TEMPLATE} Server Presets`, lines.join('\n'))], ephemeral: true });
    },

    async handleApply(interaction, guildId, context) {
        const member = interaction.member;
        if (!member?.voice?.channelId) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', 'You must be in a voice channel.')], ephemeral: true });
            return;
        }

        const name = interaction.options.getString('name', true).trim();
        const preset = await getPreset(guildId, name);
        if (!preset) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', `Preset "${name}" not found.`)], ephemeral: true });
            return;
        }

        const channel = member.voice.channel;
        const room = await context.roomService.getTrackedRoom(channel.id);
        if (!room) {
            await interaction.reply({ embeds: [createErrorEmbed('Presets', 'You are not in a tracked temp room.')], ephemeral: true });
            return;
        }

        const { updateRoomSettings } = await import('../../db/repos/roomsRepo.js');
        await updateRoomSettings(room.channelId, {
            privacyMode: preset.privacyMode,
            userLimit: preset.userLimit,
            locked: preset.locked,
            hidden: preset.hidden,
            autoNameEnabled: preset.autoNameEnabled,
            activityTag: preset.activityTag,
        });

        if (preset.userLimit !== room.userLimit) {
            await channel.setUserLimit(preset.userLimit).catch(() => null);
        }

        const settings = await ensureDefaults(guildId);
        const trustedRoleIds = settings.roomManagerRoleId
            ? [...settings.trustedRoleIds, settings.roomManagerRoleId]
            : settings.trustedRoleIds;

        await context.permissionService.applyPrivacy(
            channel, preset.privacyMode, room.ownerId, trustedRoleIds,
            { locked: preset.locked, hidden: preset.hidden },
        ).catch(() => null);

        await interaction.reply({ embeds: [createSuccessEmbed(`${PurpleOS.Icons.TEMPLATE} Preset Applied`, `**${name}** applied to your room.`)], ephemeral: true });
    },
};
