import { Defaults, PrivacyModes, type PrivacyMode } from '../../config/constants.js';
import { SafeLimits } from '../../config/safeLimits.js';
import { withRetries } from '../../utils/retry.js';
import { truncate } from '../../utils/format.js';
import { GuildSettings, type IGuildSettings } from '../models/GuildSettings.js';

export interface WizardUpsertPayload {
  categoryId?: string;
  logChannelId?: string;
  defaultTemplate: string;
  defaultPrivacy: PrivacyMode;
  defaultUserLimit: number;
  emptyDeleteSeconds: number;
  createCooldownSeconds: number;
  maxRoomsPerUser: number;
  trustedRoleIds?: string[];
  djRoleId?: string;
  setupCompletedAt?: Date;
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizePrivacy(value: string): PrivacyMode {
  return PrivacyModes.includes(value as PrivacyMode) ? (value as PrivacyMode) : Defaults.PRIVACY;
}

function sanitizePayload(payload: WizardUpsertPayload): WizardUpsertPayload {
  return {
    categoryId: payload.categoryId,
    logChannelId: payload.logChannelId,
    defaultTemplate: truncate(payload.defaultTemplate || Defaults.NAME_TEMPLATE, SafeLimits.MAX_NAME_TEMPLATE_LEN),
    defaultPrivacy: sanitizePrivacy(payload.defaultPrivacy),
    defaultUserLimit: clamp(
      SafeLimits.MIN_USER_LIMIT,
      payload.defaultUserLimit,
      SafeLimits.MAX_USER_LIMIT,
    ),
    emptyDeleteSeconds: clamp(
      SafeLimits.MIN_EMPTY_DELETE_SECONDS,
      payload.emptyDeleteSeconds,
      SafeLimits.MAX_EMPTY_DELETE_SECONDS,
    ),
    createCooldownSeconds: clamp(0, payload.createCooldownSeconds, SafeLimits.MAX_COOLDOWN_SECONDS),
    maxRoomsPerUser: clamp(
      SafeLimits.MIN_ROOMS_PER_USER,
      payload.maxRoomsPerUser,
      SafeLimits.MAX_ROOMS_PER_USER,
    ),
    trustedRoleIds: [...new Set(payload.trustedRoleIds ?? [])],
    djRoleId: payload.djRoleId,
    setupCompletedAt: payload.setupCompletedAt,
  };
}

export async function get(guildId: string): Promise<IGuildSettings | null> {
  return GuildSettings.findOne({ guildId });
}

export async function ensureDefaults(guildId: string): Promise<IGuildSettings> {
  const result = await withRetries(async () =>
    GuildSettings.findOneAndUpdate(
      { guildId },
      {
        $setOnInsert: {
          guildId,
          defaultTemplate: Defaults.NAME_TEMPLATE,
          defaultPrivacy: Defaults.PRIVACY,
          defaultUserLimit: Defaults.USER_LIMIT,
          emptyDeleteSeconds: Defaults.EMPTY_DELETE_SECONDS,
          createCooldownSeconds: Defaults.CREATE_COOLDOWN_SECONDS,
          maxRoomsPerUser: Defaults.MAX_ROOMS_PER_USER,
          trustedRoleIds: [],
        },
      },
      { upsert: true, new: true },
    ),
  );

  return result as IGuildSettings;
}

export async function upsertWizard(
  guildId: string,
  payload: WizardUpsertPayload,
): Promise<IGuildSettings> {
  const clean = sanitizePayload(payload);

  const update: Record<string, unknown> = {
    $set: {
      guildId,
      categoryId: clean.categoryId,
      logChannelId: clean.logChannelId,
      defaultTemplate: clean.defaultTemplate,
      defaultPrivacy: clean.defaultPrivacy,
      defaultUserLimit: clean.defaultUserLimit,
      emptyDeleteSeconds: clean.emptyDeleteSeconds,
      createCooldownSeconds: clean.createCooldownSeconds,
      maxRoomsPerUser: clean.maxRoomsPerUser,
      djRoleId: clean.djRoleId,
      setupCompletedAt: clean.setupCompletedAt,
    },
  };

  if (clean.trustedRoleIds && clean.trustedRoleIds.length > 0) {
    update.$addToSet = { trustedRoleIds: { $each: clean.trustedRoleIds } };
  }

  const result = await withRetries(async () =>
    GuildSettings.findOneAndUpdate({ guildId }, update, { upsert: true, new: true }),
  );

  return result as IGuildSettings;
}

export async function replaceExactConfig(
  guildId: string,
  payload: Omit<WizardUpsertPayload, 'trustedRoleIds'> & { trustedRoleIds: string[] },
): Promise<IGuildSettings> {
  const clean = sanitizePayload(payload);

  const result = await withRetries(async () =>
    GuildSettings.findOneAndUpdate(
      { guildId },
      {
        $set: {
          guildId,
          categoryId: clean.categoryId,
          logChannelId: clean.logChannelId,
          defaultTemplate: clean.defaultTemplate,
          defaultPrivacy: clean.defaultPrivacy,
          defaultUserLimit: clean.defaultUserLimit,
          emptyDeleteSeconds: clean.emptyDeleteSeconds,
          createCooldownSeconds: clean.createCooldownSeconds,
          maxRoomsPerUser: clean.maxRoomsPerUser,
          trustedRoleIds: clean.trustedRoleIds,
          djRoleId: clean.djRoleId,
          setupCompletedAt: clean.setupCompletedAt,
        },
      },
      { upsert: true, new: true },
    ),
  );

  return result as IGuildSettings;
}

export async function setCategory(guildId: string, categoryId: string): Promise<IGuildSettings> {
  const result = await withRetries(async () =>
    GuildSettings.findOneAndUpdate(
      { guildId },
      { $set: { guildId, categoryId } },
      { upsert: true, new: true },
    ),
  );

  return result as IGuildSettings;
}

export async function setLog(guildId: string, logChannelId: string): Promise<IGuildSettings> {
  const result = await withRetries(async () =>
    GuildSettings.findOneAndUpdate(
      { guildId },
      { $set: { guildId, logChannelId } },
      { upsert: true, new: true },
    ),
  );

  return result as IGuildSettings;
}

export async function setDefaults(
  guildId: string,
  payload: {
    defaultTemplate?: string;
    defaultPrivacy?: PrivacyMode;
    defaultUserLimit?: number;
  },
): Promise<IGuildSettings> {
  const safeTemplate = payload.defaultTemplate
    ? truncate(payload.defaultTemplate, SafeLimits.MAX_NAME_TEMPLATE_LEN)
    : undefined;
  const safePrivacy = payload.defaultPrivacy ? sanitizePrivacy(payload.defaultPrivacy) : undefined;
  const safeUserLimit =
    typeof payload.defaultUserLimit === 'number'
      ? clamp(SafeLimits.MIN_USER_LIMIT, payload.defaultUserLimit, SafeLimits.MAX_USER_LIMIT)
      : undefined;

  const result = await withRetries(async () =>
    GuildSettings.findOneAndUpdate(
      { guildId },
      {
        $set: {
          guildId,
          defaultTemplate: safeTemplate,
          defaultPrivacy: safePrivacy,
          defaultUserLimit: safeUserLimit,
        },
      },
      { upsert: true, new: true },
    ),
  );

  return result as IGuildSettings;
}

export async function setLimits(
  guildId: string,
  payload: {
    maxRoomsPerUser?: number;
    createCooldownSeconds?: number;
    emptyDeleteSeconds?: number;
  },
): Promise<IGuildSettings> {
  const safeMaxRooms =
    typeof payload.maxRoomsPerUser === 'number'
      ? clamp(
          SafeLimits.MIN_ROOMS_PER_USER,
          payload.maxRoomsPerUser,
          SafeLimits.MAX_ROOMS_PER_USER,
        )
      : undefined;
  const safeCooldown =
    typeof payload.createCooldownSeconds === 'number'
      ? clamp(0, payload.createCooldownSeconds, SafeLimits.MAX_COOLDOWN_SECONDS)
      : undefined;
  const safeEmptyDelete =
    typeof payload.emptyDeleteSeconds === 'number'
      ? clamp(
          SafeLimits.MIN_EMPTY_DELETE_SECONDS,
          payload.emptyDeleteSeconds,
          SafeLimits.MAX_EMPTY_DELETE_SECONDS,
        )
      : undefined;

  const result = await withRetries(async () =>
    GuildSettings.findOneAndUpdate(
      { guildId },
      {
        $set: {
          guildId,
          maxRoomsPerUser: safeMaxRooms,
          createCooldownSeconds: safeCooldown,
          emptyDeleteSeconds: safeEmptyDelete,
        },
      },
      { upsert: true, new: true },
    ),
  );

  return result as IGuildSettings;
}

export async function appendTrustedRole(guildId: string, roleId: string): Promise<void> {
  await withRetries(async () =>
    GuildSettings.updateOne(
      { guildId },
      { $addToSet: { trustedRoleIds: roleId } },
      { upsert: true },
    ),
  );
}

export async function setSetupCompletedAt(guildId: string, when: Date): Promise<void> {
  await withRetries(async () =>
    GuildSettings.updateOne({ guildId }, { $set: { setupCompletedAt: when } }, { upsert: true }),
  );
}

export async function statusPayload(guildId: string): Promise<{
  settings: IGuildSettings;
}> {
  const settings = await ensureDefaults(guildId);
  return { settings };
}
