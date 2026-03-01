import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { ChannelNames, Defaults } from '../config/constants.js';
import { get as getGuildSettings, setCategory, setDefaults, setLimits, setLog, setSetupCompletedAt } from '../db/repos/guildSettingsRepo.js';
import { add as addLobby, list as listLobbies } from '../db/repos/lobbyRepo.js';
import { logger } from '../utils/logger.js';
import { getMissingBotPermissionsNamed } from '../utils/permissions.js';

function sortNewest(channels) {
    return [...channels].sort((a, b) => {
        const aId = BigInt(a.id);
        const bId = BigInt(b.id);
        if (aId === bId) return 0;
        return aId > bId ? -1 : 1;
    });
}

function newestWithWarning(channels, guildId, kind) {
    if (channels.length === 0) return null;
    const sorted = sortNewest(channels);
    if (sorted.length > 1) {
        logger.warn(
            { guildId, kind, ids: sorted.map((c) => c.id) },
            'Setup found duplicate channel candidates; reusing newest',
        );
    }
    return sorted[0] ?? null;
}

export class SetupService {
    findExistingCategory(guild, configuredCategoryId) {
        if (configuredCategoryId) {
            const configured = guild.channels.cache.get(configuredCategoryId);
            if (configured?.type === ChannelType.GuildCategory) return configured;
        }

        const byName = guild.channels.cache
            .filter((c) => c.type === ChannelType.GuildCategory && c.name === ChannelNames.CATEGORY)
            .map((c) => c);

        return newestWithWarning(byName, guild.id, 'category-by-name');
    }

    async resolveCategory(guild, configuredCategoryId) {
        const existing = this.findExistingCategory(guild, configuredCategoryId);
        if (existing) return existing;

        return guild.channels.create({
            name: ChannelNames.CATEGORY,
            type: ChannelType.GuildCategory,
            reason: 'AURA Rooms setup',
        });
    }

    async resolveLogChannel(guild, category, configuredLogChannelId) {
        if (configuredLogChannelId) {
            const configured = guild.channels.cache.get(configuredLogChannelId);
            if (configured?.type === ChannelType.GuildText) return configured;
        }

        const byName = guild.channels.cache
            .filter((c) => c.type === ChannelType.GuildText && c.name === ChannelNames.LOG)
            .map((c) => c);

        const inCategory = byName.filter((c) => c.parentId === category.id);
        const reuse = newestWithWarning(inCategory.length > 0 ? inCategory : byName, guild.id, 'log-by-name');
        if (reuse) return reuse;

        return guild.channels.create({
            name: ChannelNames.LOG,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'AURA Rooms setup',
        });
    }

    async resolveLobbyChannel(guild, category, configuredLobbyId) {
        if (configuredLobbyId) {
            const configured = guild.channels.cache.get(configuredLobbyId);
            if (configured?.type === ChannelType.GuildVoice) return configured;
        }

        const byName = guild.channels.cache
            .filter((c) => c.type === ChannelType.GuildVoice && c.name === ChannelNames.LOBBY)
            .map((c) => c);

        const inCategory = byName.filter((c) => c.parentId === category.id);
        const reuse = newestWithWarning(inCategory.length > 0 ? inCategory : byName, guild.id, 'lobby-by-name');
        if (reuse) return reuse;

        return guild.channels.create({
            name: ChannelNames.LOBBY,
            type: ChannelType.GuildVoice,
            parent: category.id,
            reason: 'AURA Rooms setup',
        });
    }

    async run(guild) {
        await guild.channels.fetch();
        const settings = await getGuildSettings(guild.id);
        const lobbies = await listLobbies(guild.id);

        const missing = new Set(getMissingBotPermissionsNamed(guild));
        const existingCategory = this.findExistingCategory(guild, settings?.categoryId);
        const me = guild.members.me;

        if (me && existingCategory && !me.permissionsIn(existingCategory).has(PermissionFlagsBits.ManageChannels)) {
            missing.add('ManageChannels (category)');
        }

        if (missing.size > 0) {
            return { ok: false, missingPermissions: [...missing] };
        }

        const category = await this.resolveCategory(guild, settings?.categoryId);
        const logChannel = await this.resolveLogChannel(guild, category, settings?.logChannelId);
        const configuredLobbyCandidates = lobbies
            .map((entry) => guild.channels.cache.get(entry.lobbyChannelId))
            .filter((c) => c?.type === ChannelType.GuildVoice);
        const configuredLobby = newestWithWarning(configuredLobbyCandidates, guild.id, 'configured-lobbies');
        const lobbyChannel = await this.resolveLobbyChannel(guild, category, configuredLobby?.id);

        try {
            await setCategory(guild.id, category.id);
            await setLog(guild.id, logChannel.id);
            await setDefaults(guild.id, {
                defaultTemplate: Defaults.NAME_TEMPLATE,
                defaultPrivacy: Defaults.PRIVACY,
                defaultUserLimit: Defaults.USER_LIMIT,
            });
            await setLimits(guild.id, {
                maxRoomsPerUser: Defaults.MAX_ROOMS_PER_USER,
                createCooldownSeconds: Defaults.CREATE_COOLDOWN_SECONDS,
                emptyDeleteSeconds: Defaults.EMPTY_DELETE_SECONDS,
            });
            await setSetupCompletedAt(guild.id, new Date());
            await addLobby(guild.id, lobbyChannel.id);
        } catch (error) {
            logger.error({ error, guildId: guild.id }, 'Setup DB save failed');
            return { ok: false, dbSaveFailed: true, category, logChannel, lobbyChannel };
        }

        return { ok: true, category, logChannel, lobbyChannel };
    }
}
