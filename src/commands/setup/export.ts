import { Buffer } from 'node:buffer';
import { z } from 'zod';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import { ExportImportVersion } from '../../config/constants.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { list as listLobbies } from '../../db/repos/lobbyRepo.js';
import type { AppContext, ExportData } from '../../types/index.js';
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
    emptyDeleteSeconds: z.number().int().min(5).max(3600).optional(),
    createCooldownSeconds: z.number().int().min(0).max(3600).optional(),
    maxRoomsPerUser: z.number().int().min(1).max(10).optional(),
    trustedRoleIds: z.array(z.string()).optional(),
    djRoleId: z.string().optional(),
    setupCompletedAt: z.string().optional(),
  }),
  lobbies: z.array(z.object({ lobbyChannelId: z.string() })),
});

export async function buildExportPayload(guildId: string): Promise<ExportData> {
  const settings = await ensureDefaults(guildId);
  const lobbies = await listLobbies(guildId);

  const payload: ExportData = {
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
      setupCompletedAt: settings.setupCompletedAt?.toISOString(),
    },
    lobbies: lobbies.map((row) => ({ lobbyChannelId: row.lobbyChannelId })),
  };

  return exportSchema.parse(payload);
}

export async function sendSetupExport(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  context?: AppContext,
): Promise<void> {
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
      action: 'setup_export',
      result: 'success',
      actorId: interaction.user.id,
      requestId: getRequestId(interaction),
      details: `Exported setup config with ${payload.lobbies.length} lobby entries.`,
    });
  }
}

export async function handleSetupExport(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  await sendSetupExport(interaction, _context);
}

