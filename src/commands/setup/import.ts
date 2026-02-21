import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  Attachment,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { ComponentIds } from '../../config/constants.js';
import { SafeLimits, SNOWFLAKE_REGEX } from '../../config/safeLimits.js';
import {
  ensureDefaults,
  replaceExactConfig,
} from '../../db/repos/guildSettingsRepo.js';
import { replaceExact } from '../../db/repos/lobbyRepo.js';
import type {
  AppContext,
  ButtonHandler,
  ExportData,
  ModalHandler,
  PendingImportConfirmation,
} from '../../types/index.js';
import {
  createSetupImportConfirmButtons,
  createSetupImportModal,
} from '../../ui/components.js';
import {
  createErrorEmbed,
  createInfoEmbed,
  createSuccessEmbed,
} from '../../ui/embeds.js';
import { PermissionError, ValidationError } from '../../utils/errors.js';
import { assertAdmin, assertGuildInteraction } from '../../utils/guards.js';
import { getRequestId } from '../../utils/requestContext.js';
import { parseSafeJson } from '../../utils/safeJson.js';

const importSchema = z
  .object({
    version: z.number().int().min(1),
    exportedAt: z.string().datetime(),
    guildSettings: z
      .object({
        categoryId: z.string().regex(SNOWFLAKE_REGEX).optional(),
        logChannelId: z.string().regex(SNOWFLAKE_REGEX).optional(),
        defaultTemplate: z.string().min(1).max(SafeLimits.MAX_NAME_TEMPLATE_LEN).optional(),
        defaultPrivacy: z.enum(['public', 'locked', 'private']).optional(),
        defaultUserLimit: z.number().int().min(0).max(SafeLimits.MAX_USER_LIMIT).optional(),
        emptyDeleteSeconds: z
          .number()
          .int()
          .min(SafeLimits.MIN_EMPTY_DELETE_SECONDS)
          .max(SafeLimits.MAX_EMPTY_DELETE_SECONDS)
          .optional(),
        createCooldownSeconds: z
          .number()
          .int()
          .min(0)
          .max(SafeLimits.MAX_COOLDOWN_SECONDS)
          .optional(),
        maxRoomsPerUser: z
          .number()
          .int()
          .min(SafeLimits.MIN_ROOMS_PER_USER)
          .max(SafeLimits.MAX_ROOMS_PER_USER)
          .optional(),
        trustedRoleIds: z
          .array(z.string().regex(SNOWFLAKE_REGEX))
          .max(SafeLimits.MAX_ALLOW_DENY_ENTRIES)
          .optional(),
        djRoleId: z.string().regex(SNOWFLAKE_REGEX).optional(),
        setupCompletedAt: z.string().datetime().optional(),
      })
      .strict(),
    lobbies: z
      .array(z.object({ lobbyChannelId: z.string().regex(SNOWFLAKE_REGEX) }).strict())
      .max(SafeLimits.MAX_IMPORTED_LOBBIES),
  })
  .strict();

const pendingImports = new Map<string, PendingImportConfirmation>();

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clearExpiredPendingImports(): void {
  const now = Date.now();
  for (const [key, pending] of pendingImports) {
    if (pending.expiresAt <= now) {
      pendingImports.delete(key);
    }
  }
}

function trimPendingImports(): void {
  if (pendingImports.size < SafeLimits.MAX_PENDING_IMPORTS) {
    return;
  }

  const ordered = [...pendingImports.values()].sort((a, b) => a.createdAt - b.createdAt);
  const removeCount = pendingImports.size - SafeLimits.MAX_PENDING_IMPORTS + 1;
  for (let i = 0; i < removeCount; i += 1) {
    const pending = ordered[i];
    if (!pending) {
      break;
    }
    pendingImports.delete(pending.id);
  }
}

function stageImport(
  guildId: string,
  userId: string,
  payload: ExportData,
): PendingImportConfirmation {
  clearExpiredPendingImports();
  trimPendingImports();

  const now = Date.now();
  const id = randomUUID();
  const pending: PendingImportConfirmation = {
    id,
    guildId,
    userId,
    createdAt: now,
    expiresAt: now + SafeLimits.IMPORT_CONFIRM_TTL_MS,
    payload,
  };

  pendingImports.set(id, pending);
  return pending;
}

function consumePendingImport(id: string): PendingImportConfirmation | null {
  const pending = pendingImports.get(id);
  if (!pending) {
    return null;
  }

  pendingImports.delete(id);
  if (pending.expiresAt <= Date.now()) {
    return null;
  }

  return pending;
}

function findPendingImport(id: string): PendingImportConfirmation | null {
  const pending = pendingImports.get(id);
  if (!pending) {
    return null;
  }

  if (pending.expiresAt <= Date.now()) {
    pendingImports.delete(id);
    return null;
  }

  return pending;
}

function removePendingImport(id: string): boolean {
  return pendingImports.delete(id);
}

function extractToken(customId: string, prefix: string): string | null {
  const expected = `${prefix}:`;
  if (!customId.startsWith(expected)) {
    return null;
  }

  const token = customId.slice(expected.length).trim();
  return token.length > 0 ? token : null;
}

function toExportData(raw: unknown): ExportData {
  const parsed = importSchema.parse(raw);
  const trusted = [...new Set(parsed.guildSettings.trustedRoleIds ?? [])];
  const lobbies = [...new Set(parsed.lobbies.map((entry) => entry.lobbyChannelId))].slice(
    0,
    SafeLimits.MAX_IMPORTED_LOBBIES,
  );

  return {
    version: parsed.version,
    exportedAt: parsed.exportedAt,
    guildSettings: {
      categoryId: parsed.guildSettings.categoryId,
      logChannelId: parsed.guildSettings.logChannelId,
      defaultTemplate: parsed.guildSettings.defaultTemplate,
      defaultPrivacy: parsed.guildSettings.defaultPrivacy,
      defaultUserLimit:
        parsed.guildSettings.defaultUserLimit === undefined
          ? undefined
          : clamp(
              SafeLimits.MIN_USER_LIMIT,
              parsed.guildSettings.defaultUserLimit,
              SafeLimits.MAX_USER_LIMIT,
            ),
      emptyDeleteSeconds:
        parsed.guildSettings.emptyDeleteSeconds === undefined
          ? undefined
          : clamp(
              SafeLimits.MIN_EMPTY_DELETE_SECONDS,
              parsed.guildSettings.emptyDeleteSeconds,
              SafeLimits.MAX_EMPTY_DELETE_SECONDS,
            ),
      createCooldownSeconds:
        parsed.guildSettings.createCooldownSeconds === undefined
          ? undefined
          : clamp(
              0,
              parsed.guildSettings.createCooldownSeconds,
              SafeLimits.MAX_COOLDOWN_SECONDS,
            ),
      maxRoomsPerUser:
        parsed.guildSettings.maxRoomsPerUser === undefined
          ? undefined
          : clamp(
              SafeLimits.MIN_ROOMS_PER_USER,
              parsed.guildSettings.maxRoomsPerUser,
              SafeLimits.MAX_ROOMS_PER_USER,
            ),
      trustedRoleIds: trusted,
      djRoleId: parsed.guildSettings.djRoleId,
      setupCompletedAt: parsed.guildSettings.setupCompletedAt,
    },
    lobbies: lobbies.map((lobbyChannelId) => ({ lobbyChannelId })),
  };
}

async function parseAttachmentText(attachment: Attachment): Promise<string> {
  if (attachment.size > SafeLimits.MAX_IMPORT_BYTES) {
    throw new ValidationError(
      `Import file exceeds ${SafeLimits.MAX_IMPORT_BYTES} bytes.`,
    );
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new ValidationError('Failed to fetch import attachment.');
  }

  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > SafeLimits.MAX_IMPORT_BYTES) {
    throw new ValidationError(
      `Import JSON exceeds ${SafeLimits.MAX_IMPORT_BYTES} bytes.`,
    );
  }

  return raw;
}

function parseImportPayload(raw: string): ExportData {
  const parsed = parseSafeJson(raw, SafeLimits.MAX_IMPORT_BYTES);
  return toExportData(parsed);
}

async function applyImport(
  guildId: string,
  payload: ExportData,
): Promise<{ lobbyCount: number }> {
  const current = await ensureDefaults(guildId);

  await replaceExactConfig(guildId, {
    categoryId: payload.guildSettings.categoryId,
    logChannelId: payload.guildSettings.logChannelId,
    defaultTemplate: payload.guildSettings.defaultTemplate ?? current.defaultTemplate,
    defaultPrivacy: payload.guildSettings.defaultPrivacy ?? current.defaultPrivacy,
    defaultUserLimit: payload.guildSettings.defaultUserLimit ?? current.defaultUserLimit,
    emptyDeleteSeconds: payload.guildSettings.emptyDeleteSeconds ?? current.emptyDeleteSeconds,
    createCooldownSeconds:
      payload.guildSettings.createCooldownSeconds ?? current.createCooldownSeconds,
    maxRoomsPerUser: payload.guildSettings.maxRoomsPerUser ?? current.maxRoomsPerUser,
    trustedRoleIds: payload.guildSettings.trustedRoleIds ?? current.trustedRoleIds,
    djRoleId: payload.guildSettings.djRoleId ?? current.djRoleId,
    setupCompletedAt: payload.guildSettings.setupCompletedAt
      ? new Date(payload.guildSettings.setupCompletedAt)
      : current.setupCompletedAt ?? new Date(),
  });

  await replaceExact(
    guildId,
    payload.lobbies.map((entry) => entry.lobbyChannelId),
  );

  return { lobbyCount: payload.lobbies.length };
}

function buildImportSummaryEmbed(payload: ExportData) {
  return createInfoEmbed(
    'Import Review',
    'Confirm to replace current setup settings and lobby list exactly.',
    [
      {
        name: 'Template',
        value: payload.guildSettings.defaultTemplate ?? 'Unchanged',
        inline: false,
      },
      {
        name: 'Privacy',
        value: payload.guildSettings.defaultPrivacy ?? 'Unchanged',
        inline: true,
      },
      {
        name: 'Default Limit',
        value:
          payload.guildSettings.defaultUserLimit === undefined
            ? 'Unchanged'
            : String(payload.guildSettings.defaultUserLimit),
        inline: true,
      },
      {
        name: 'Max Rooms/User',
        value:
          payload.guildSettings.maxRoomsPerUser === undefined
            ? 'Unchanged'
            : String(payload.guildSettings.maxRoomsPerUser),
        inline: true,
      },
      {
        name: 'Create Cooldown',
        value:
          payload.guildSettings.createCooldownSeconds === undefined
            ? 'Unchanged'
            : `${payload.guildSettings.createCooldownSeconds}s`,
        inline: true,
      },
      {
        name: 'Empty Delete',
        value:
          payload.guildSettings.emptyDeleteSeconds === undefined
            ? 'Unchanged'
            : `${payload.guildSettings.emptyDeleteSeconds}s`,
        inline: true,
      },
      {
        name: 'Trusted Roles',
        value: String(payload.guildSettings.trustedRoleIds?.length ?? 0),
        inline: true,
      },
      {
        name: 'Lobbies',
        value: String(payload.lobbies.length),
        inline: true,
      },
      {
        name: 'Confirmation Expires',
        value: `${Math.floor(SafeLimits.IMPORT_CONFIRM_TTL_MS / 60_000)} minutes`,
        inline: true,
      },
    ],
  );
}

async function stageAndReplyImport(
  interaction:
    | ChatInputCommandInteraction
    | ModalSubmitInteraction
    | ButtonInteraction,
  context: AppContext,
  payload: ExportData,
): Promise<void> {
  if (!interaction.guildId) {
    throw new ValidationError('Guild context is missing.');
  }

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
    action: 'setup_import_staged',
    result: 'info',
    actorId: interaction.user.id,
    requestId: getRequestId(interaction),
    details: `Staged config import with ${payload.lobbies.length} lobby entries.`,
  });
}

export async function handleSetupImport(
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> {
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
}

export const setupImportModalHandler: ModalHandler = {
  customId: ComponentIds.SETUP_IMPORT_MODAL,
  async execute(interaction: ModalSubmitInteraction, context: AppContext): Promise<void> {
    assertGuildInteraction(interaction);
    assertAdmin(interaction);

    const raw = interaction.fields.getTextInputValue(ComponentIds.SETUP_IMPORT_JSON_INPUT);
    const payload = parseImportPayload(raw);
    await stageAndReplyImport(interaction, context, payload);
  },
};

export const setupImportButtonHandlers: ButtonHandler[] = [
  {
    customId: (customId) => customId.startsWith(`${ComponentIds.SETUP_IMPORT_CONFIRM}:`),
    async execute(interaction: ButtonInteraction, context: AppContext): Promise<void> {
      assertGuildInteraction(interaction);
      assertAdmin(interaction);

      const token = extractToken(interaction.customId, ComponentIds.SETUP_IMPORT_CONFIRM);
      if (!token) {
        throw new ValidationError('Invalid import confirmation token.');
      }

      const pending = findPendingImport(token);
      if (!pending) {
        throw new ValidationError('Import confirmation expired or not found.');
      }

      if (!interaction.guildId || pending.guildId !== interaction.guildId) {
        throw new PermissionError('This confirmation does not belong to this guild.');
      }

      if (pending.userId !== interaction.user.id) {
        throw new PermissionError('Only the user who staged this import can confirm it.');
      }

      const ready = consumePendingImport(token);
      if (!ready) {
        throw new ValidationError('Import confirmation expired or already used.');
      }

      const result = await applyImport(interaction.guildId, ready.payload);

      await interaction.update({
        embeds: [
          createSuccessEmbed('Import Completed', 'Configuration has been applied.', [
            { name: 'Lobbies', value: String(result.lobbyCount), inline: true },
          ]),
        ],
        components: [],
      });

      await context.auditLogService.logEvent(interaction.guildId, {
        action: 'setup_import_apply',
        result: 'success',
        actorId: interaction.user.id,
        requestId: getRequestId(interaction),
        details: `Applied config import with ${result.lobbyCount} lobby entries.`,
      });
    },
  },
  {
    customId: (customId) => customId.startsWith(`${ComponentIds.SETUP_IMPORT_CANCEL}:`),
    async execute(interaction: ButtonInteraction, context: AppContext): Promise<void> {
      assertGuildInteraction(interaction);
      assertAdmin(interaction);

      const token = extractToken(interaction.customId, ComponentIds.SETUP_IMPORT_CANCEL);
      if (!token) {
        throw new ValidationError('Invalid import cancel token.');
      }

      const pending = findPendingImport(token);
      if (!pending) {
        throw new ValidationError('Import confirmation expired or not found.');
      }

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
        action: 'setup_import_cancel',
        result: 'info',
        actorId: interaction.user.id,
        requestId: getRequestId(interaction),
        details: 'Cancelled staged config import.',
      });
    },
  },
];
