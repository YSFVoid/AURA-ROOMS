import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { AuditEventTypes, ComponentIds, LogVerbosityLevels, NamingPolicies } from '../../config/constants.js';
import { SafeLimits, SNOWFLAKE_REGEX } from '../../config/safeLimits.js';
import { ensureDefaults, replaceExactConfig } from '../../db/repos/guildSettingsRepo.js';
import { replaceExact } from '../../db/repos/lobbyRepo.js';
import { createSetupImportConfirmButtons, createSetupImportModal } from '../../ui/components.js';
import { createErrorEmbed, createInfoEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { PermissionError, ValidationError } from '../../utils/errors.js';
import { assertAdmin, assertGuildInteraction } from '../../utils/guards.js';
import { getRequestId } from '../../utils/requestContext.js';
import { parseSafeJson } from '../../utils/safeJson.js';

const setupImportSchema = z
    .object({
        version: z.number().int().min(1),
        exportedAt: z.string().datetime(),
        guildSettings: z
            .object({
                categoryId: z.string().regex(SNOWFLAKE_REGEX).optional(),
                logChannelId: z.string().regex(SNOWFLAKE_REGEX).optional(),
                defaultTemplate: z.string().min(1).max(SafeLimits.MAX_NAME_TEMPLATE_LEN).optional(),
                defaultPrivacy: z.enum(['public', 'locked', 'private']).optional(),
                defaultUserLimit: z.number().int().min(0).max(10_000).optional(),
                emptyDeleteSeconds: z.number().int().min(SafeLimits.MIN_EMPTY_DELETE_SECONDS).max(100_000).optional(),
                createCooldownSeconds: z.number().int().min(0).max(100_000).optional(),
                maxRoomsPerUser: z.number().int().min(SafeLimits.MIN_ROOMS_PER_USER).max(10_000).optional(),
                trustedRoleIds: z.array(z.string().regex(SNOWFLAKE_REGEX)).max(SafeLimits.MAX_ALLOW_DENY_ENTRIES).optional(),
                djRoleId: z.string().regex(SNOWFLAKE_REGEX).optional(),
                roomManagerRoleId: z.string().regex(SNOWFLAKE_REGEX).optional(),
                logVerbosity: z.enum(LogVerbosityLevels).optional(),
                namingPolicy: z.enum(NamingPolicies).optional(),
                setupCompletedAt: z.string().datetime().optional(),
            })
            .strict(),
        lobbies: z
            .array(z.object({ lobbyChannelId: z.string().regex(SNOWFLAKE_REGEX) }).strict())
            .max(SafeLimits.MAX_IMPORTED_LOBBIES),
    })
    .strict();

const pendingImports = new Map();

function clamp(min, value, max) {
    return Math.max(min, Math.min(max, value));
}

function clearExpiredPendingImports() {
    const now = Date.now();
    for (const [key, pending] of pendingImports) {
        if (pending.expiresAt <= now) pendingImports.delete(key);
    }
}

function trimPendingImports() {
    if (pendingImports.size < SafeLimits.MAX_PENDING_IMPORTS) return;

    const ordered = [...pendingImports.values()].sort((a, b) => a.createdAt - b.createdAt);
    const removeCount = pendingImports.size - SafeLimits.MAX_PENDING_IMPORTS + 1;
    for (let i = 0; i < removeCount; i += 1) {
        const pending = ordered[i];
        if (!pending) break;
        pendingImports.delete(pending.id);
    }
}

function stageImport(guildId, userId, payload) {
    clearExpiredPendingImports();
    trimPendingImports();

    const now = Date.now();
    const id = randomUUID();
    const pending = {
        id, guildId, userId,
        createdAt: now,
        expiresAt: now + SafeLimits.IMPORT_CONFIRM_TTL_MS,
        payload,
    };

    pendingImports.set(id, pending);
    return pending;
}

function consumePendingImport(id) {
    const pending = pendingImports.get(id);
    if (!pending) return null;
    pendingImports.delete(id);
    if (pending.expiresAt <= Date.now()) return null;
    return pending;
}

function findPendingImport(id) {
    const pending = pendingImports.get(id);
    if (!pending) return null;
    if (pending.expiresAt <= Date.now()) {
        pendingImports.delete(id);
        return null;
    }
    return pending;
}

function removePendingImport(id) {
    return pendingImports.delete(id);
}

function extractToken(customId, prefix) {
    const expected = `${prefix}:`;
    if (!customId.startsWith(expected)) return null;
    const token = customId.slice(expected.length).trim();
    return token.length > 0 ? token : null;
}

function toExportData(raw) {
    const parsed = setupImportSchema.parse(raw);
    const trusted = [...new Set(parsed.guildSettings.trustedRoleIds ?? [])];
    const lobbies = [...new Set(parsed.lobbies.map((entry) => entry.lobbyChannelId))].slice(0, SafeLimits.MAX_IMPORTED_LOBBIES);

    return {
        version: parsed.version,
        exportedAt: parsed.exportedAt,
        guildSettings: {
            categoryId: parsed.guildSettings.categoryId,
            logChannelId: parsed.guildSettings.logChannelId,
            defaultTemplate: parsed.guildSettings.defaultTemplate,
            defaultPrivacy: parsed.guildSettings.defaultPrivacy,
            defaultUserLimit: parsed.guildSettings.defaultUserLimit === undefined ? undefined : clamp(SafeLimits.MIN_USER_LIMIT, parsed.guildSettings.defaultUserLimit, SafeLimits.MAX_USER_LIMIT),
            emptyDeleteSeconds: parsed.guildSettings.emptyDeleteSeconds === undefined ? undefined : clamp(SafeLimits.MIN_EMPTY_DELETE_SECONDS, parsed.guildSettings.emptyDeleteSeconds, SafeLimits.MAX_EMPTY_DELETE_SECONDS),
            createCooldownSeconds: parsed.guildSettings.createCooldownSeconds === undefined ? undefined : clamp(0, parsed.guildSettings.createCooldownSeconds, SafeLimits.MAX_COOLDOWN_SECONDS),
            maxRoomsPerUser: parsed.guildSettings.maxRoomsPerUser === undefined ? undefined : clamp(SafeLimits.MIN_ROOMS_PER_USER, parsed.guildSettings.maxRoomsPerUser, SafeLimits.MAX_ROOMS_PER_USER),
            trustedRoleIds: trusted,
            djRoleId: parsed.guildSettings.djRoleId,
            roomManagerRoleId: parsed.guildSettings.roomManagerRoleId,
            logVerbosity: parsed.guildSettings.logVerbosity,
            namingPolicy: parsed.guildSettings.namingPolicy,
            setupCompletedAt: parsed.guildSettings.setupCompletedAt,
        },
        lobbies: lobbies.map((lobbyChannelId) => ({ lobbyChannelId })),
    };
}

async function parseAttachmentText(attachment) {
    if (attachment.size > SafeLimits.MAX_IMPORT_BYTES) {
        throw new ValidationError(`Import file exceeds ${SafeLimits.MAX_IMPORT_BYTES} bytes.`);
    }

    const response = await fetch(attachment.url);
    if (!response.ok) throw new ValidationError('Failed to fetch import attachment.');

    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > SafeLimits.MAX_IMPORT_BYTES) {
        throw new ValidationError(`Import JSON exceeds ${SafeLimits.MAX_IMPORT_BYTES} bytes.`);
    }

    return raw;
}

function parseImportPayload(raw) {
    const parsed = parseSafeJson(raw, SafeLimits.MAX_IMPORT_BYTES);
    return toExportData(parsed);
}

async function applyImport(guildId, payload) {
    const current = await ensureDefaults(guildId);

    await replaceExactConfig(guildId, {
        categoryId: payload.guildSettings.categoryId,
        logChannelId: payload.guildSettings.logChannelId,
        defaultTemplate: payload.guildSettings.defaultTemplate ?? current.defaultTemplate,
        defaultPrivacy: payload.guildSettings.defaultPrivacy ?? current.defaultPrivacy,
        defaultUserLimit: payload.guildSettings.defaultUserLimit ?? current.defaultUserLimit,
        emptyDeleteSeconds: payload.guildSettings.emptyDeleteSeconds ?? current.emptyDeleteSeconds,
        createCooldownSeconds: payload.guildSettings.createCooldownSeconds ?? current.createCooldownSeconds,
        maxRoomsPerUser: payload.guildSettings.maxRoomsPerUser ?? current.maxRoomsPerUser,
        trustedRoleIds: payload.guildSettings.trustedRoleIds ?? current.trustedRoleIds,
        djRoleId: payload.guildSettings.djRoleId ?? current.djRoleId,
        roomManagerRoleId: payload.guildSettings.roomManagerRoleId ?? current.roomManagerRoleId,
        logVerbosity: payload.guildSettings.logVerbosity ?? current.logVerbosity,
        namingPolicy: payload.guildSettings.namingPolicy ?? current.namingPolicy,
        setupCompletedAt: payload.guildSettings.setupCompletedAt
            ? new Date(payload.guildSettings.setupCompletedAt)
            : current.setupCompletedAt ?? new Date(),
    });

    await replaceExact(guildId, payload.lobbies.map((entry) => entry.lobbyChannelId));
    return { lobbyCount: payload.lobbies.length };
}

function buildImportSummaryEmbed(payload) {
    return createInfoEmbed('Import Review', 'Confirm to replace current setup settings and lobby list exactly.', [
        { name: 'Template', value: payload.guildSettings.defaultTemplate ?? 'Unchanged', inline: false },
        { name: 'Privacy', value: payload.guildSettings.defaultPrivacy ?? 'Unchanged', inline: true },
        { name: 'Default Limit', value: payload.guildSettings.defaultUserLimit === undefined ? 'Unchanged' : String(payload.guildSettings.defaultUserLimit), inline: true },
        { name: 'Max Rooms/User', value: payload.guildSettings.maxRoomsPerUser === undefined ? 'Unchanged' : String(payload.guildSettings.maxRoomsPerUser), inline: true },
        { name: 'Log Verbosity', value: payload.guildSettings.logVerbosity ?? 'Unchanged', inline: true },
        { name: 'Naming Policy', value: payload.guildSettings.namingPolicy ?? 'Unchanged', inline: true },
        { name: 'Lobbies', value: String(payload.lobbies.length), inline: true },
        { name: 'Confirmation Expires', value: `${Math.floor(SafeLimits.IMPORT_CONFIRM_TTL_MS / 60_000)} minutes`, inline: true },
    ]);
}

async function stageAndReplyImport(interaction, context, payload) {
    if (!interaction.guildId) throw new ValidationError('Guild context is missing.');

    const pending = stageImport(interaction.guildId, interaction.user.id, payload);
    const embed = buildImportSummaryEmbed(payload);
    const components = [createSetupImportConfirmButtons(pending.id)];

    if (interaction.isChatInputCommand()) {
        await interaction.reply({ embeds: [embed], components, ephemeral: true });
    } else if (interaction.isModalSubmit()) {
        await interaction.reply({ embeds: [embed], components, ephemeral: true });
    } else {
        await interaction.editReply({ embeds: [embed], components });
    }

    await context.auditLogService.logEvent(interaction.guildId, {
        eventType: 'IMPORT_STAGED',
        result: 'info',
        actorId: interaction.user.id,
        requestId: getRequestId(interaction),
        details: `Staged config import with ${payload.lobbies.length} lobby entries.`,
    });
}

export const importCommand = {
    data: new SlashCommandBuilder()
        .setName('import')
        .setDescription('Import AURA Rooms configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addAttachmentOption((option) =>
            option.setName('file').setDescription('Config JSON file. If omitted, a modal opens.'),
        ),

    async execute(interaction, context) {
        if (!interaction.inGuild() || !interaction.memberPermissions) {
            await interaction.reply({
                embeds: [createErrorEmbed('Import', 'This command can only be used inside a server.')],
                ephemeral: true,
            });
            return;
        }

        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                embeds: [createErrorEmbed('Import', 'Administrator permission is required.')],
                ephemeral: true,
            });
            return;
        }

        assertGuildInteraction(interaction);
        assertAdmin(interaction);

        const file = interaction.options.getAttachment('file');

        if (!file) {
            await interaction.showModal(createSetupImportModal());
            return;
        }

        const raw = await parseAttachmentText(file);
        const payload = parseImportPayload(raw);
        await stageAndReplyImport(interaction, context, payload);
    },
};

export const importModalHandler = {
    customId: ComponentIds.SETUP_IMPORT_MODAL,
    async execute(interaction, context) {
        assertGuildInteraction(interaction);
        assertAdmin(interaction);

        const raw = interaction.fields.getTextInputValue(ComponentIds.SETUP_IMPORT_JSON_INPUT);
        const payload = parseImportPayload(raw);
        await stageAndReplyImport(interaction, context, payload);
    },
};

export const importButtonHandlers = [
    {
        customId: (customId) => customId.startsWith(`${ComponentIds.SETUP_IMPORT_CONFIRM}:`),
        async execute(interaction, context) {
            assertGuildInteraction(interaction);
            assertAdmin(interaction);

            const token = extractToken(interaction.customId, ComponentIds.SETUP_IMPORT_CONFIRM);
            if (!token) throw new ValidationError('Invalid import confirmation token.');

            const pending = findPendingImport(token);
            if (!pending) throw new ValidationError('Import confirmation expired or not found.');

            if (!interaction.guildId || pending.guildId !== interaction.guildId) {
                throw new PermissionError('This confirmation does not belong to this guild.');
            }

            if (pending.userId !== interaction.user.id) {
                throw new PermissionError('Only the user who staged this import can confirm it.');
            }

            const ready = consumePendingImport(token);
            if (!ready) throw new ValidationError('Import confirmation expired or already used.');

            const result = await applyImport(interaction.guildId, ready.payload);

            await interaction.update({
                embeds: [createSuccessEmbed('Import Completed', 'Configuration has been applied.', [
                    { name: 'Lobbies', value: String(result.lobbyCount), inline: true },
                ])],
                components: [],
            });

            await context.auditLogService.logEvent(interaction.guildId, {
                eventType: AuditEventTypes.IMPORT_CONFIRMED,
                result: 'success',
                actorId: interaction.user.id,
                requestId: getRequestId(interaction),
                details: `Applied config import with ${result.lobbyCount} lobby entries.`,
                level: 'minimal',
            });
        },
    },
    {
        customId: (customId) => customId.startsWith(`${ComponentIds.SETUP_IMPORT_CANCEL}:`),
        async execute(interaction, context) {
            assertGuildInteraction(interaction);
            assertAdmin(interaction);

            const token = extractToken(interaction.customId, ComponentIds.SETUP_IMPORT_CANCEL);
            if (!token) throw new ValidationError('Invalid import cancel token.');

            const pending = findPendingImport(token);
            if (!pending) throw new ValidationError('Import confirmation expired or not found.');

            if (!interaction.guildId || pending.guildId !== interaction.guildId) {
                throw new PermissionError('This confirmation does not belong to this guild.');
            }

            if (pending.userId !== interaction.user.id) {
                throw new PermissionError('Only the user who staged this import can cancel it.');
            }

            removePendingImport(token);

            await interaction.update({
                embeds: [createErrorEmbed('Import Cancelled', 'No configuration changes were applied.')],
                components: [],
            });

            await context.auditLogService.logEvent(interaction.guildId, {
                eventType: 'IMPORT_CANCELLED',
                result: 'info',
                actorId: interaction.user.id,
                requestId: getRequestId(interaction),
                details: 'Cancelled staged config import.',
            });
        },
    },
];
