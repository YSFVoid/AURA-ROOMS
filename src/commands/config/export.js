import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { ExportImportVersion, LogVerbosityLevels, NamingPolicies } from '../../config/constants.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { list as listLobbies } from '../../db/repos/lobbyRepo.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { toJsonString } from '../../utils/jsonFile.js';
import { getRequestId } from '../../utils/requestContext.js';

const exportSchema = z.object({
    version: z.number().int(),
    exportedAt: z.string().datetime(),
    guildSettings: z.object({
        categoryId: z.string().optional(),
        logChannelId: z.string().optional(),
        defaultTemplate: z.string().optional(),
        defaultPrivacy: z.enum(['public', 'locked', 'private']).optional(),
        defaultUserLimit: z.number().int().min(0).max(99).optional(),
        emptyDeleteSeconds: z.number().int().min(3).max(3600).optional(),
        createCooldownSeconds: z.number().int().min(0).max(3600).optional(),
        maxRoomsPerUser: z.number().int().min(1).max(10).optional(),
        trustedRoleIds: z.array(z.string()).optional(),
        djRoleId: z.string().optional(),
        roomManagerRoleId: z.string().optional(),
        logVerbosity: z.enum(LogVerbosityLevels).optional(),
        namingPolicy: z.enum(NamingPolicies).optional(),
        setupCompletedAt: z.string().optional(),
    }),
    lobbies: z.array(z.object({ lobbyChannelId: z.string() })),
});

export async function buildExportPayload(guildId) {
    const settings = await ensureDefaults(guildId);
    const lobbies = await listLobbies(guildId);

    const payload = {
        version: ExportImportVersion,
        exportedAt: new Date().toISOString(),
        guildSettings: {
            categoryId: settings.categoryId,
            logChannelId: settings.logChannelId,
            defaultTemplate: settings.defaultTemplate,
            defaultPrivacy: settings.defaultPrivacy,
            defaultUserLimit: settings.defaultUserLimit,
            emptyDeleteSeconds: settings.emptyDeleteSeconds,
            createCooldownSeconds: settings.createCooldownSeconds,
            maxRoomsPerUser: settings.maxRoomsPerUser,
            trustedRoleIds: settings.trustedRoleIds,
            djRoleId: settings.djRoleId,
            roomManagerRoleId: settings.roomManagerRoleId,
            logVerbosity: settings.logVerbosity,
            namingPolicy: settings.namingPolicy,
            setupCompletedAt: settings.setupCompletedAt?.toISOString(),
        },
        lobbies: lobbies.map((row) => ({ lobbyChannelId: row.lobbyChannelId })),
    };

    return exportSchema.parse(payload);
}

export async function sendSetupExport(interaction, context) {
    if (!interaction.guildId) {
        await interaction.reply({
            embeds: [createErrorEmbed('Export Failed', 'Guild context is missing.')],
            ephemeral: true,
        });
        return;
    }

    const payload = await buildExportPayload(interaction.guildId);
    const json = toJsonString(payload);
    const fileName = `aura-config-${interaction.guildId}.json`;

    await interaction.reply({
        embeds: [createSuccessEmbed('Export Ready', `Generated file ${fileName}.`)],
        files: [{ attachment: Buffer.from(json, 'utf-8'), name: fileName }],
        ephemeral: true,
    });

    if (context) {
        await context.auditLogService.logEvent(interaction.guildId, {
            eventType: 'SETUP_EXPORT',
            result: 'success',
            actorId: interaction.user.id,
            requestId: getRequestId(interaction),
            details: `Exported setup config with ${payload.lobbies.length} lobby entries.`,
        });
    }
}

export const exportCommand = {
    data: new SlashCommandBuilder()
        .setName('export')
        .setDescription('Export AURA Rooms configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, context) {
        if (!interaction.inGuild() || !interaction.memberPermissions) {
            await interaction.reply({
                embeds: [createErrorEmbed('Export', 'This command can only be used inside a server.')],
                ephemeral: true,
            });
            return;
        }

        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                embeds: [createErrorEmbed('Export', 'Administrator permission is required.')],
                ephemeral: true,
            });
            return;
        }

        await sendSetupExport(interaction, context);
    },
};
