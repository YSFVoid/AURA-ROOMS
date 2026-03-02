import { Defaults, LogVerbosityLevels, NamingPolicies, PrivacyModes } from '../../config/constants.js';
import { SafeLimits } from '../../config/safeLimits.js';
import { withRetries } from '../../utils/retry.js';
import { truncate } from '../../utils/format.js';
import { GuildSettings } from '../models/GuildSettings.js';

function clamp(min, value, max) {
    return Math.max(min, Math.min(max, value));
}

function sanitizePrivacy(value) {
    return PrivacyModes.includes(value) ? value : Defaults.PRIVACY;
}

function sanitizeLogVerbosity(value) {
    if (!value) return Defaults.LOG_VERBOSITY;
    return LogVerbosityLevels.includes(value) ? value : Defaults.LOG_VERBOSITY;
}

function sanitizeNamingPolicy(value) {
    if (!value) return Defaults.NAMING_POLICY;
    return NamingPolicies.includes(value) ? value : Defaults.NAMING_POLICY;
}

function sanitizePayload(payload) {
    return {
        categoryId: payload.categoryId,
        logChannelId: payload.logChannelId,
        defaultTemplate: truncate(payload.defaultTemplate || Defaults.NAME_TEMPLATE, SafeLimits.MAX_NAME_TEMPLATE_LEN),
        defaultPrivacy: sanitizePrivacy(payload.defaultPrivacy),
        defaultUserLimit: clamp(SafeLimits.MIN_USER_LIMIT, payload.defaultUserLimit, SafeLimits.MAX_USER_LIMIT),
        emptyDeleteSeconds: clamp(SafeLimits.MIN_EMPTY_DELETE_SECONDS, payload.emptyDeleteSeconds, SafeLimits.MAX_EMPTY_DELETE_SECONDS),
        createCooldownSeconds: clamp(0, payload.createCooldownSeconds, SafeLimits.MAX_COOLDOWN_SECONDS),
        maxRoomsPerUser: clamp(SafeLimits.MIN_ROOMS_PER_USER, payload.maxRoomsPerUser, SafeLimits.MAX_ROOMS_PER_USER),
        trustedRoleIds: [...new Set(payload.trustedRoleIds ?? [])],
        djRoleId: payload.djRoleId,
        roomManagerRoleId: payload.roomManagerRoleId,
        logVerbosity: sanitizeLogVerbosity(payload.logVerbosity),
        namingPolicy: sanitizeNamingPolicy(payload.namingPolicy),
        setupCompletedAt: payload.setupCompletedAt,
    };
}

export async function get(guildId) {
    return GuildSettings.findOne({ guildId });
}

export async function ensureDefaults(guildId) {
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
                    logVerbosity: Defaults.LOG_VERBOSITY,
                    namingPolicy: Defaults.NAMING_POLICY,
                },
            },
            { upsert: true, new: true },
        ),
    );

    const doc = result;
    if (doc.logVerbosity && doc.namingPolicy) return doc;

    const normalized = await withRetries(async () =>
        GuildSettings.findOneAndUpdate(
            { guildId },
            {
                $set: {
                    logVerbosity: sanitizeLogVerbosity(doc.logVerbosity),
                    namingPolicy: sanitizeNamingPolicy(doc.namingPolicy),
                },
            },
            { new: true },
        ),
    );

    return normalized ?? doc;
}

export async function normalizeAllGuildSettingsDefaults() {
    const docs = await GuildSettings.find();
    await Promise.all(
        docs.map(async (doc) => {
            const patch = {};

            if (!doc.logVerbosity) patch.logVerbosity = Defaults.LOG_VERBOSITY;
            if (!doc.namingPolicy) patch.namingPolicy = Defaults.NAMING_POLICY;
            if (doc.emptyDeleteSeconds !== Defaults.EMPTY_DELETE_SECONDS) {
                patch.emptyDeleteSeconds = Defaults.EMPTY_DELETE_SECONDS;
            }

            if (Object.keys(patch).length === 0) return;
            await GuildSettings.updateOne({ _id: doc._id }, { $set: patch });
        }),
    );
}

export async function replaceExactConfig(guildId, payload) {
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
                    roomManagerRoleId: clean.roomManagerRoleId,
                    logVerbosity: clean.logVerbosity,
                    namingPolicy: clean.namingPolicy,
                    setupCompletedAt: clean.setupCompletedAt,
                },
            },
            { upsert: true, new: true },
        ),
    );

    return result;
}

export async function setCategory(guildId, categoryId) {
    return withRetries(async () =>
        GuildSettings.findOneAndUpdate(
            { guildId },
            { $set: { guildId, categoryId } },
            { upsert: true, new: true },
        ),
    );
}

export async function setLog(guildId, logChannelId) {
    return withRetries(async () =>
        GuildSettings.findOneAndUpdate(
            { guildId },
            { $set: { guildId, logChannelId } },
            { upsert: true, new: true },
        ),
    );
}

export async function setInterfaceChannel(guildId, interfaceChannelId) {
    return withRetries(async () =>
        GuildSettings.findOneAndUpdate(
            { guildId },
            { $set: { guildId, interfaceChannelId } },
            { upsert: true, new: true },
        ),
    );
}

export async function setDefaults(guildId, payload) {
    const safeTemplate = payload.defaultTemplate
        ? truncate(payload.defaultTemplate, SafeLimits.MAX_NAME_TEMPLATE_LEN)
        : undefined;
    const safePrivacy = payload.defaultPrivacy ? sanitizePrivacy(payload.defaultPrivacy) : undefined;
    const safeUserLimit =
        typeof payload.defaultUserLimit === 'number'
            ? clamp(SafeLimits.MIN_USER_LIMIT, payload.defaultUserLimit, SafeLimits.MAX_USER_LIMIT)
            : undefined;

    return withRetries(async () =>
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
}

export async function setLimits(guildId, payload) {
    const safeMaxRooms =
        typeof payload.maxRoomsPerUser === 'number'
            ? clamp(SafeLimits.MIN_ROOMS_PER_USER, payload.maxRoomsPerUser, SafeLimits.MAX_ROOMS_PER_USER)
            : undefined;
    const safeCooldown =
        typeof payload.createCooldownSeconds === 'number'
            ? clamp(0, payload.createCooldownSeconds, SafeLimits.MAX_COOLDOWN_SECONDS)
            : undefined;
    const safeEmptyDelete =
        typeof payload.emptyDeleteSeconds === 'number'
            ? clamp(SafeLimits.MIN_EMPTY_DELETE_SECONDS, payload.emptyDeleteSeconds, SafeLimits.MAX_EMPTY_DELETE_SECONDS)
            : undefined;

    return withRetries(async () =>
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
}

export async function setSetupCompletedAt(guildId, when) {
    await withRetries(async () =>
        GuildSettings.updateOne({ guildId }, { $set: { setupCompletedAt: when } }, { upsert: true }),
    );
}
