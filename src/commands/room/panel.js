import {
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { AuditEventTypes, Branding, ComponentIds, Defaults } from '../../config/constants.js';
import { ChannelType } from 'discord.js';
import { SafeLimits } from '../../config/safeLimits.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { transferOwner, updateRoomSettings } from '../../db/repos/roomsRepo.js';
import {
    createPermissionModal,
    createRoomActivityModal,
    createRoomLimitModal,
    createRoomRenameModal,
} from '../../ui/components.js';
import { createActionFeedback, createCooldownEmbed, createErrorEmbed } from '../../ui/embeds.js';
import { buildRoomPanelComponents, buildRoomPanelEmbed } from '../../ui/roomPanel.js';
import { PurpleOS } from '../../ui/theme.js';
import { ValidationError } from '../../utils/errors.js';
import { assertBotPerms, assertInTempRoom, assertRoomActionAllowed } from '../../utils/guards.js';
import { canClaimRoom, isValidUserLimit } from '../../utils/permissions.js';
import { getRequestId } from '../../utils/requestContext.js';
import { handleRoomActivity } from './activity.js';

const cooldownMap = new Map();

function checkCooldown(userId, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const expires = cooldownMap.get(key);
    if (expires && now < expires) {
        return Math.ceil((expires - now) / 1000);
    }
    cooldownMap.set(key, now + Defaults.PANEL_ACTION_COOLDOWN_MS);
    return 0;
}

function accessRoleIds(settings) {
    return settings.roomManagerRoleId
        ? [...settings.trustedRoleIds, settings.roomManagerRoleId]
        : settings.trustedRoleIds;
}

async function getRoomContext(interaction) {
    const roomContext = await assertInTempRoom(interaction);
    const settings = await ensureDefaults(roomContext.member.guild.id);
    return { ...roomContext, settings };
}

function assertScope(context, scope) {
    assertRoomActionAllowed(
        context.member, context.room.ownerId, context.settings.trustedRoleIds,
        context.settings.roomManagerRoleId, scope,
    );
}

async function panelPayload(appContext, member, channel) {
    const room = await appContext.roomService.getTrackedRoom(channel.id);
    if (!room) return null;

    const templates = await appContext.templateService.listTemplates(member.guild.id, member.id);
    const canClaim = canClaimRoom(member, channel, room.ownerId);

    return {
        embeds: [await buildRoomPanelEmbed(room, channel)],
        components: await buildRoomPanelComponents({ room, channel, templates, canClaim }),
    };
}

async function refreshPanel(interaction, appContext) {
    const context = await getRoomContext(interaction);
    const payload = await panelPayload(appContext, context.member, context.channel);
    if (!payload) throw new ValidationError('This channel is not a tracked temp room.');

    if (interaction.isMessageComponent()) {
        await interaction.update(payload).catch(() => null);
    }

    if (context.room.panelMessageId && interaction.message?.id !== context.room.panelMessageId) {
        await syncInterfacePanel(appContext, context);
    }
}

export async function syncInterfacePanel(appContext, context) {
    if (!context.room.panelMessageId || !context.settings.interfaceChannelId) return;

    const interfaceChannel = context.member.guild.channels.cache.get(context.settings.interfaceChannelId);
    if (!interfaceChannel || interfaceChannel.type !== ChannelType.GuildText) return;

    const message = await interfaceChannel.messages.fetch(context.room.panelMessageId).catch(() => null);
    if (!message) return;

    const currentRoom = await appContext.roomService.getTrackedRoom(context.channel.id);
    if (!currentRoom) return;

    const owner = await context.member.guild.members.fetch(currentRoom.ownerId).catch(() => context.member);
    const payload = await panelPayload(appContext, owner, context.channel);
    if (payload) {
        await message.edit(payload).catch(() => null);
    }
}

async function assertUserExistsInGuild(guildMember, userId) {
    const target = await guildMember.guild.members.fetch(userId).catch(() => null);
    if (!target) throw new ValidationError('User does not exist in this guild.');
}

function assertRoleExistsInGuild(guildMember, roleId) {
    const role = guildMember.guild.roles.cache.get(roleId);
    if (!role) throw new ValidationError('Role does not exist in this guild.');
    if (role.id === guildMember.guild.roles.everyone.id) {
        throw new ValidationError('Cannot modify @everyone via allow/deny actions.');
    }
}

function computeLockPatch(context, shouldLock) {
    if (shouldLock) {
        const previous = context.room.previousPrivacyMode ?? context.room.privacyMode;
        return {
            privacyMode: context.room.hidden ? 'private' : 'locked',
            previousPrivacyMode: previous, locked: true, hidden: context.room.hidden,
        };
    }
    return {
        privacyMode: context.room.hidden ? 'private' : context.room.previousPrivacyMode ?? context.room.privacyMode,
        previousPrivacyMode: context.room.hidden ? context.room.previousPrivacyMode : undefined,
        locked: false, hidden: context.room.hidden,
    };
}

function computeVisibilityPatch(context, shouldHide) {
    if (shouldHide) {
        const previous = context.room.previousPrivacyMode ?? context.room.privacyMode;
        return { privacyMode: 'private', previousPrivacyMode: previous, locked: context.room.locked, hidden: true };
    }
    return {
        privacyMode: context.room.locked ? 'locked' : context.room.previousPrivacyMode ?? context.room.privacyMode,
        previousPrivacyMode: context.room.locked ? context.room.previousPrivacyMode : undefined,
        locked: context.room.locked, hidden: false,
    };
}

export async function handleRoomPanel(interaction, context) {
    const roomContext = await getRoomContext(interaction);
    assertScope(roomContext, 'moderation');
    const payload = await panelPayload(context, roomContext.member, roomContext.channel);
    if (!payload) throw new ValidationError('Unable to load room panel.');
    await interaction.reply({ ...payload, ephemeral: true });
}

function buildInfoEmbed(room, channel) {
    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.PRIMARY)
        .setTitle(`${PurpleOS.Icons.INFO} Room Info`)
        .setDescription(`Detailed view for ${channel.toString()}`)
        .addFields(
            { name: 'Channel ID', value: `\`${channel.id}\``, inline: true },
            { name: 'Owner', value: `<@${room.ownerId}>`, inline: true },
            { name: 'Privacy', value: room.privacyMode, inline: true },
            { name: 'Locked', value: room.locked ? 'Yes' : 'No', inline: true },
            { name: 'Hidden', value: room.hidden ? 'Yes' : 'No', inline: true },
            { name: 'User Limit', value: room.userLimit === 0 ? '∞' : String(room.userLimit), inline: true },
            { name: 'Activity', value: room.activityTag || 'None', inline: true },
            { name: 'AutoName', value: room.autoNameEnabled ? 'On' : 'Off', inline: true },
            { name: 'Members', value: String(channel.members.size), inline: true },
            { name: 'Note', value: room.note || 'None', inline: false },
        )
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export const roomCommand = {
    data: new SlashCommandBuilder()
        .setName('room')
        .setDescription('Manage your temp voice room')
        .addSubcommand((sub) => sub.setName('panel').setDescription('Open your room control panel'))
        .addSubcommand((sub) =>
            sub.setName('activity').setDescription('Set room activity and auto-name state')
                .addStringOption((o) => o.setName('tag').setDescription('Activity tag').setMaxLength(SafeLimits.MAX_ACTIVITY_TAG_LEN))
                .addBooleanOption((o) => o.setName('autoname').setDescription('Auto name enabled')),
        ),

    async execute(interaction, context) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'panel') { await handleRoomPanel(interaction, context); return; }
        if (subcommand === 'activity') { await handleRoomActivity(interaction, context); return; }
        await interaction.reply({ embeds: [createErrorEmbed('Room', 'Unknown room action.')], ephemeral: true });
    },
};

export const roomButtonHandlers = [
    {
        customId: ComponentIds.ROOM_RENAME_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createRoomRenameModal(context.channel.name));
        },
    },
    {
        customId: ComponentIds.ROOM_LIMIT_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createRoomLimitModal(context.room.userLimit));
        },
    },
    {
        customId: ComponentIds.ROOM_ALLOW_USER_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_USER, 'User ID'));
        },
    },
    {
        customId: ComponentIds.ROOM_DENY_USER_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_DENY_USER, 'User ID'));
        },
    },
    {
        customId: ComponentIds.ROOM_ALLOW_ROLE_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_ROLE, 'Role ID'));
        },
    },
    {
        customId: ComponentIds.ROOM_DENY_ROLE_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createPermissionModal(ComponentIds.ROOM_PERMISSION_MODAL_DENY_ROLE, 'Role ID'));
        },
    },
    {
        customId: ComponentIds.ROOM_CLAIM_BUTTON,
        async execute(interaction, appContext) {
            const cd = checkCooldown(interaction.user.id, 'claim');
            if (cd > 0) { await interaction.reply({ embeds: [createCooldownEmbed(cd)], ephemeral: true }); return; }

            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            if (!canClaimRoom(context.member, context.channel, context.room.ownerId)) {
                throw new ValidationError('Claim is only available when the owner is absent from this room.');
            }
            await transferOwner(context.channel.id, context.member.id);
            await appContext.permissionService.applyPrivacy(
                context.channel, context.room.privacyMode, context.member.id,
                accessRoleIds(context.settings), { locked: context.room.locked, hidden: context.room.hidden },
            );
            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.ROOM_TRANSFERRED, result: 'success', actorId: context.member.id,
                requestId: getRequestId(interaction), details: `Claimed room ${context.channel.id}`,
            });
            await refreshPanel(interaction, appContext);
        },
    },
    {
        customId: ComponentIds.ROOM_ACTIVITY_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            await interaction.showModal(createRoomActivityModal(context.room.activityTag ?? ''));
        },
    },
    {
        customId: ComponentIds.ROOM_AUTONAME_TOGGLE,
        async execute(interaction, appContext) {
            const cd = checkCooldown(interaction.user.id, 'autoname');
            if (cd > 0) { await interaction.reply({ embeds: [createCooldownEmbed(cd)], ephemeral: true }); return; }

            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            const next = !context.room.autoNameEnabled;
            await updateRoomSettings(context.room.channelId, { autoNameEnabled: next, lastActiveAt: new Date() });
            await refreshPanel(interaction, appContext);
        },
    },
    {
        customId: ComponentIds.ROOM_LOCK_TOGGLE,
        async execute(interaction, appContext) {
            const cd = checkCooldown(interaction.user.id, 'lock');
            if (cd > 0) { await interaction.reply({ embeds: [createCooldownEmbed(cd)], ephemeral: true }); return; }

            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const shouldLock = !context.room.locked;
            const patch = computeLockPatch(context, shouldLock);
            await appContext.permissionService.toggleLock(
                context.channel, shouldLock, context.room.ownerId,
                accessRoleIds(context.settings), context.settings.roomManagerRoleId,
                patch.privacyMode, patch.hidden,
            );
            await updateRoomSettings(context.room.channelId, {
                locked: patch.locked, hidden: patch.hidden,
                privacyMode: patch.privacyMode, previousPrivacyMode: patch.previousPrivacyMode,
                lastActiveAt: new Date(),
            });
            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.LOCK_TOGGLED, result: 'success',
                actorId: context.member.id, requestId: getRequestId(interaction),
                details: `${shouldLock ? 'Locked' : 'Unlocked'} room ${context.channel.id}`,
            });
            await refreshPanel(interaction, appContext);
        },
    },
    {
        customId: ComponentIds.ROOM_VISIBILITY_TOGGLE,
        async execute(interaction, appContext) {
            const cd = checkCooldown(interaction.user.id, 'visibility');
            if (cd > 0) { await interaction.reply({ embeds: [createCooldownEmbed(cd)], ephemeral: true }); return; }

            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const shouldHide = !context.room.hidden;
            const patch = computeVisibilityPatch(context, shouldHide);
            await appContext.permissionService.toggleVisibility(
                context.channel, shouldHide, context.room.ownerId,
                accessRoleIds(context.settings), context.settings.roomManagerRoleId,
                patch.privacyMode, patch.locked,
            );
            await updateRoomSettings(context.room.channelId, {
                hidden: patch.hidden, locked: patch.locked,
                privacyMode: patch.privacyMode, previousPrivacyMode: patch.previousPrivacyMode,
                lastActiveAt: new Date(),
            });
            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.VISIBILITY_TOGGLED, result: 'success',
                actorId: context.member.id, requestId: getRequestId(interaction),
                details: `${shouldHide ? 'Hidden' : 'Shown'} room ${context.channel.id}`,
            });
            await refreshPanel(interaction, appContext);
        },
    },
    {
        customId: ComponentIds.ROOM_INFO_BUTTON,
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            await interaction.reply({ embeds: [buildInfoEmbed(context.room, context.channel)], ephemeral: true });
        },
    },
];

export const roomSelectHandlers = [
    {
        customId: ComponentIds.ROOM_PRIVACY_SELECT,
        async execute(interaction, appContext) {
            const cd = checkCooldown(interaction.user.id, 'privacy');
            if (cd > 0) { await interaction.reply({ embeds: [createCooldownEmbed(cd)], ephemeral: true }); return; }

            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const requestedMode = interaction.values[0];
            const effectiveMode = context.room.hidden ? 'private' : context.room.locked ? 'locked' : requestedMode;
            const previousPrivacyMode = (context.room.locked || context.room.hidden) ? requestedMode : undefined;
            await appContext.permissionService.applyPrivacy(
                context.channel, effectiveMode, context.room.ownerId,
                accessRoleIds(context.settings), { locked: context.room.locked, hidden: context.room.hidden },
            );
            await updateRoomSettings(context.room.channelId, { privacyMode: effectiveMode, previousPrivacyMode, lastActiveAt: new Date() });
            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.PRIVACY_CHANGED, result: 'success',
                actorId: context.member.id, requestId: getRequestId(interaction),
                details: `Set privacy=${effectiveMode} for ${context.channel.id}`,
            });
            await refreshPanel(interaction, appContext);
        },
    },
    {
        customId: ComponentIds.ROOM_KICK_SELECT,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            assertBotPerms(context.member, [PermissionFlagsBits.MoveMembers], context.channel.id);
            const targetId = interaction.values[0];
            if (targetId === 'none') { await interaction.deferUpdate(); return; }
            const targetMember = await context.member.guild.members.fetch(targetId).catch(() => null);
            if (!targetMember || !targetMember.voice.channelId || targetMember.voice.channelId !== context.channel.id) {
                throw new ValidationError('Selected member is not in this room.');
            }
            await targetMember.voice.disconnect();
            await refreshPanel(interaction, appContext);
        },
    },
    {
        customId: ComponentIds.ROOM_TEMPLATE_SELECT,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const selected = interaction.values[0];
            if (selected === 'none') { await interaction.deferUpdate(); return; }
            await appContext.templateService.applyTemplateToRoom({
                templateName: selected, guildId: context.member.guild.id,
                ownerId: context.member.id, member: context.member,
                channel: context.channel, room: context.room,
                trustedRoleIds: accessRoleIds(context.settings),
                namingPolicy: context.settings.namingPolicy,
            });
            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.TEMPLATE_APPLIED, result: 'success',
                actorId: context.member.id, requestId: getRequestId(interaction),
                details: `Applied template=${selected} to ${context.channel.id}`,
            });
            await refreshPanel(interaction, appContext);
        },
    },
];

export const roomModalHandlers = [
    {
        customId: ComponentIds.ROOM_RENAME_MODAL,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const nextName = interaction.fields.getTextInputValue(ComponentIds.ROOM_RENAME_INPUT).trim();
            if (nextName.length === 0 || nextName.length > SafeLimits.MAX_ROOM_NAME_LEN) {
                throw new ValidationError(`Room name must be 1-${SafeLimits.MAX_ROOM_NAME_LEN} characters.`);
            }
            await appContext.permissionService.rename(context.channel, nextName, context.settings.namingPolicy);
            await updateRoomSettings(context.room.channelId, { lastActiveAt: new Date() });
            await syncInterfacePanel(appContext, context);
            await interaction.reply({ embeds: [createActionFeedback('Rename', `\`${nextName}\``, getRequestId(interaction))], ephemeral: true });
        },
    },
    {
        customId: ComponentIds.ROOM_LIMIT_MODAL,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const raw = interaction.fields.getTextInputValue(ComponentIds.ROOM_LIMIT_INPUT).trim();
            const limit = Number(raw);
            if (!Number.isFinite(limit) || !isValidUserLimit(limit)) {
                throw new ValidationError('Limit must be an integer between 0 and 99.');
            }
            await appContext.permissionService.setUserLimit(context.channel, limit);
            await updateRoomSettings(context.room.channelId, { userLimit: limit, lastActiveAt: new Date() });
            await syncInterfacePanel(appContext, context);
            await interaction.reply({ embeds: [createActionFeedback('Limit', limit === 0 ? '∞' : `\`${limit}\``, getRequestId(interaction))], ephemeral: true });
        },
    },
    {
        customId: ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_USER,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const userId = interaction.fields.getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT).trim();
            await assertUserExistsInGuild(context.member, userId);
            await appContext.permissionService.allowUser(context.channel, context.room.privacyMode, context.room.ownerId, accessRoleIds(context.settings), userId, { locked: context.room.locked, hidden: context.room.hidden });
            await syncInterfacePanel(appContext, context);
            await interaction.reply({ embeds: [createActionFeedback('Allow User', `<@${userId}>`, getRequestId(interaction))], ephemeral: true });
        },
    },
    {
        customId: ComponentIds.ROOM_PERMISSION_MODAL_DENY_USER,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const userId = interaction.fields.getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT).trim();
            await assertUserExistsInGuild(context.member, userId);
            await appContext.permissionService.denyUser(context.channel, context.room.privacyMode, context.room.ownerId, accessRoleIds(context.settings), userId, { locked: context.room.locked, hidden: context.room.hidden });
            await syncInterfacePanel(appContext, context);
            await interaction.reply({ embeds: [createActionFeedback('Deny User', `<@${userId}>`, getRequestId(interaction))], ephemeral: true });
        },
    },
    {
        customId: ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_ROLE,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const roleId = interaction.fields.getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT).trim();
            assertRoleExistsInGuild(context.member, roleId);
            await appContext.permissionService.allowRole(context.channel, context.room.privacyMode, context.room.ownerId, accessRoleIds(context.settings), roleId, { locked: context.room.locked, hidden: context.room.hidden });
            await syncInterfacePanel(appContext, context);
            await interaction.reply({ embeds: [createActionFeedback('Allow Role', `<@&${roleId}>`, getRequestId(interaction))], ephemeral: true });
        },
    },
    {
        customId: ComponentIds.ROOM_PERMISSION_MODAL_DENY_ROLE,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            const roleId = interaction.fields.getTextInputValue(ComponentIds.ROOM_PERMISSION_INPUT).trim();
            assertRoleExistsInGuild(context.member, roleId);
            await appContext.permissionService.denyRole(context.channel, context.room.privacyMode, context.room.ownerId, accessRoleIds(context.settings), roleId, { locked: context.room.locked, hidden: context.room.hidden });
            await syncInterfacePanel(appContext, context);
            await interaction.reply({ embeds: [createActionFeedback('Deny Role', `<@&${roleId}>`, getRequestId(interaction))], ephemeral: true });
        },
    },
    {
        customId: ComponentIds.ROOM_ACTIVITY_MODAL,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            const value = interaction.fields.getTextInputValue(ComponentIds.ROOM_ACTIVITY_INPUT).trim();
            if (value.length > SafeLimits.MAX_ACTIVITY_TAG_LEN) {
                throw new ValidationError(`Activity must be at most ${SafeLimits.MAX_ACTIVITY_TAG_LEN} characters.`);
            }
            await updateRoomSettings(context.room.channelId, { activityTag: value.length > 0 ? value : undefined, lastActiveAt: new Date() });
            await syncInterfacePanel(appContext, context);
            await interaction.reply({ embeds: [createActionFeedback('Activity', value || 'Cleared', getRequestId(interaction))], ephemeral: true });
        },
    },
];
