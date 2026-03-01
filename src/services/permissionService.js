import { PermissionFlagsBits } from 'discord.js';
import { SafeLimits, SNOWFLAKE_REGEX } from '../config/safeLimits.js';
import { listByChannel, removePermission, setPermission } from '../db/repos/permissionsRepo.js';
import { sanitizeRoomName } from '../utils/format.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

function uniqueBigInt(values) {
    return [...new Set(values.map((v) => v.toString()))].map((v) => BigInt(v));
}

function removeBigInt(values, removeValue) {
    return values.filter((v) => v !== removeValue);
}

export class PermissionService {
    assertManageChannelPerm(channel) {
        const me = channel.guild.members.me;
        if (!me || !me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
            throw new PermissionError('Bot needs ManageChannels permission in this room.');
        }
    }

    assertSnowflake(targetId) {
        if (!SNOWFLAKE_REGEX.test(targetId)) throw new ValidationError('Invalid target ID.');
    }

    async assertPermissionEntryLimit(channelId, type, targetId) {
        const existing = await listByChannel(channelId);
        const alreadyExists = existing.some((row) => row.type === type && row.targetId === targetId);
        if (!alreadyExists && existing.length >= SafeLimits.MAX_ALLOW_DENY_ENTRIES) {
            throw new ValidationError(`Room permission entry limit reached (${SafeLimits.MAX_ALLOW_DENY_ENTRIES}).`);
        }
    }

    async assertNoPrivilegeEscalation(params) {
        if (params.type === 'role' && params.targetId === params.channel.guild.roles.everyone.id) {
            throw new ValidationError('Cannot modify @everyone via allow/deny list.');
        }

        if (params.action !== 'deny') return;

        if (params.type === 'user' && params.targetId === params.ownerId) {
            throw new ValidationError('Cannot deny the room owner.');
        }

        if (params.type === 'user' && params.trustedRoleIds.length > 0) {
            const member = await params.channel.guild.members.fetch(params.targetId).catch(() => null);
            if (member && params.trustedRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
                throw new ValidationError('Cannot deny users with trusted roles.');
            }
        }

        if (params.type === 'role' && params.trustedRoleIds.includes(params.targetId)) {
            throw new ValidationError('Cannot deny trusted roles.');
        }
    }

    async setAction(channel, mode, ownerId, trustedRoleIds, type, targetId, action, state) {
        this.assertManageChannelPerm(channel);
        this.assertSnowflake(targetId);
        await this.assertNoPrivilegeEscalation({ channel, ownerId, trustedRoleIds, type, targetId, action });
        await this.assertPermissionEntryLimit(channel.id, type, targetId);

        await setPermission(channel.id, type, targetId, action);
        await this.applyPrivacy(channel, mode, ownerId, trustedRoleIds, state);
    }

    async applyPrivacy(channel, mode, ownerId, trustedRoleIds, state) {
        this.assertManageChannelPerm(channel);

        const roomPermissions = await listByChannel(channel.id);
        const overwrites = this.buildOverwrites(
            channel, mode, ownerId, trustedRoleIds,
            roomPermissions.map((row) => ({ type: row.type, targetId: row.targetId, action: row.action })),
            state,
        );

        await channel.permissionOverwrites.set(overwrites);
    }

    async toggleLock(channel, shouldLock, ownerId, trustedRoleIds, _roomManagerRoleId, baseMode = 'locked', hidden = false) {
        await this.applyPrivacy(channel, baseMode, ownerId, trustedRoleIds, { locked: shouldLock, hidden });
    }

    async toggleVisibility(channel, shouldHide, ownerId, trustedRoleIds, _roomManagerRoleId, baseMode = 'private', locked = false) {
        await this.applyPrivacy(channel, baseMode, ownerId, trustedRoleIds, { locked, hidden: shouldHide });
    }

    async setUserLimit(channel, userLimit) {
        this.assertManageChannelPerm(channel);
        await channel.setUserLimit(userLimit);
    }

    async rename(channel, nextName, namingPolicy = 'normal') {
        this.assertManageChannelPerm(channel);
        const safeName = sanitizeRoomName(nextName, namingPolicy);
        await channel.setName(safeName);
    }

    async allowUser(channel, mode, ownerId, trustedRoleIds, userId, state) {
        await this.setAction(channel, mode, ownerId, trustedRoleIds, 'user', userId, 'allow', state);
    }

    async denyUser(channel, mode, ownerId, trustedRoleIds, userId, state) {
        await this.setAction(channel, mode, ownerId, trustedRoleIds, 'user', userId, 'deny', state);
    }

    async allowRole(channel, mode, ownerId, trustedRoleIds, roleId, state) {
        await this.setAction(channel, mode, ownerId, trustedRoleIds, 'role', roleId, 'allow', state);
    }

    async denyRole(channel, mode, ownerId, trustedRoleIds, roleId, state) {
        await this.setAction(channel, mode, ownerId, trustedRoleIds, 'role', roleId, 'deny', state);
    }

    async removeTarget(channel, mode, ownerId, trustedRoleIds, type, targetId, state) {
        this.assertManageChannelPerm(channel);
        await removePermission(channel.id, type, targetId);
        await this.applyPrivacy(channel, mode, ownerId, trustedRoleIds, state);
    }

    buildOverwrites(channel, mode, ownerId, trustedRoleIds, explicitPermissions, state) {
        const overwrites = [];

        let everyoneDeny = [];
        let everyoneAllow = [];

        if (mode === 'public') everyoneAllow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect];
        if (mode === 'locked') {
            everyoneAllow = [PermissionFlagsBits.ViewChannel];
            everyoneDeny = [PermissionFlagsBits.Connect];
        }
        if (mode === 'private') everyoneDeny = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect];

        if (state?.locked) {
            everyoneAllow = removeBigInt(everyoneAllow, PermissionFlagsBits.Connect);
            everyoneDeny = uniqueBigInt([...everyoneDeny, PermissionFlagsBits.Connect]);
        }

        if (state?.hidden) {
            everyoneAllow = removeBigInt(everyoneAllow, PermissionFlagsBits.ViewChannel);
            everyoneDeny = uniqueBigInt([...everyoneDeny, PermissionFlagsBits.ViewChannel]);
        }

        overwrites.push({ id: channel.guild.roles.everyone.id, allow: everyoneAllow, deny: everyoneDeny });

        const accessAllow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect];
        overwrites.push({ id: ownerId, allow: accessAllow, deny: [] });

        const sortedTrusted = [...new Set(trustedRoleIds)].sort((a, b) => a.localeCompare(b));
        for (const roleId of sortedTrusted) {
            overwrites.push({ id: roleId, allow: accessAllow, deny: [] });
        }

        const sortedExplicit = [...explicitPermissions].sort((a, b) => {
            if (a.type === b.type) return a.targetId.localeCompare(b.targetId);
            return a.type.localeCompare(b.type);
        });

        for (const entry of sortedExplicit) {
            const allow = entry.action === 'allow' ? accessAllow : [];
            const deny = entry.action === 'deny' ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] : [];
            overwrites.push({ id: entry.targetId, allow, deny });
        }

        return overwrites;
    }
}
