
import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { AuditEventTypes, AuraPanelIds, Branding, ComponentIds, Defaults } from '../../config/constants.js';
import { SafeLimits } from '../../config/safeLimits.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { transferOwner, updateRoomSettings } from '../../db/repos/roomsRepo.js';
import {
    createAuraLimitModal,
    createAuraNoteModal,
    createAuraPermissionModal,
    createAuraRenameModal,
} from '../../ui/components.js';
import { renderAuraInterface } from '../../ui/auraInterface.js';
import { createActionFeedback, createCooldownEmbed, createErrorEmbed, createInfoEmbed } from '../../ui/embeds.js';
import { ValidationError } from '../../utils/errors.js';
import { assertBotPerms, assertInTempRoom, assertRoomActionAllowed } from '../../utils/guards.js';
import { canClaimRoom, isValidUserLimit } from '../../utils/permissions.js';
import { getRequestId } from '../../utils/requestContext.js';
import { handleRoomActivity } from './activity.js';

const cooldownMap = new Map();
const panelStateMap = new Map();
const PANEL_STATE_TTL_MS = 10 * 60 * 1000;

const CompatIds = {
    rename: [AuraPanelIds.RENAME, ComponentIds.ROOM_RENAME_BUTTON],
    limit: [AuraPanelIds.LIMIT, ComponentIds.ROOM_LIMIT_BUTTON],
    lock: [AuraPanelIds.LOCK, ComponentIds.ROOM_LOCK_TOGGLE],
    hide: [AuraPanelIds.HIDE, ComponentIds.ROOM_VISIBILITY_TOGGLE],
    privacy: [AuraPanelIds.PRIVACY],
    claim: [AuraPanelIds.CLAIM, ComponentIds.ROOM_CLAIM_BUTTON],
    activity: [AuraPanelIds.ACTIVITY, ComponentIds.ROOM_ACTIVITY_BUTTON],
    autoName: [AuraPanelIds.AUTONAME, ComponentIds.ROOM_AUTONAME_TOGGLE],
    refresh: [AuraPanelIds.REFRESH],
    info: [AuraPanelIds.INFO, ComponentIds.ROOM_INFO_BUTTON],
    allowUser: [AuraPanelIds.ALLOW_USER, ComponentIds.ROOM_ALLOW_USER_BUTTON],
    denyUser: [AuraPanelIds.DENY_USER, ComponentIds.ROOM_DENY_USER_BUTTON],
    allowRole: [AuraPanelIds.ALLOW_ROLE, ComponentIds.ROOM_ALLOW_ROLE_BUTTON],
    denyRole: [AuraPanelIds.DENY_ROLE, ComponentIds.ROOM_DENY_ROLE_BUTTON],
    templates: [AuraPanelIds.TEMPLATES],
    templatesApply: [AuraPanelIds.TEMPLATES_APPLY],
    permissions: [AuraPanelIds.PERMISSIONS],
    note: [AuraPanelIds.NOTE],
    kick: [AuraPanelIds.KICK, AuraPanelIds.KICK_VIEW],
    backMain: [AuraPanelIds.BACK_MAIN, AuraPanelIds.BACK_VIEW],
    privacySelect: [AuraPanelIds.PRIVACY_SELECT, ComponentIds.ROOM_PRIVACY_SELECT],
    kickSelect: [AuraPanelIds.KICK_SELECT, ComponentIds.ROOM_KICK_SELECT],
    templateSelect: [AuraPanelIds.TEMPLATE_SELECT, ComponentIds.ROOM_TEMPLATE_SELECT],
    activitySelect: [AuraPanelIds.ACTIVITY_SELECT],
    modalRename: [AuraPanelIds.MODAL_RENAME, ComponentIds.ROOM_RENAME_MODAL],
    modalLimit: [AuraPanelIds.MODAL_LIMIT, ComponentIds.ROOM_LIMIT_MODAL],
    modalAllowUser: [AuraPanelIds.MODAL_ALLOW_USER, ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_USER],
    modalDenyUser: [AuraPanelIds.MODAL_DENY_USER, ComponentIds.ROOM_PERMISSION_MODAL_DENY_USER],
    modalAllowRole: [AuraPanelIds.MODAL_ALLOW_ROLE, ComponentIds.ROOM_PERMISSION_MODAL_ALLOW_ROLE],
    modalDenyRole: [AuraPanelIds.MODAL_DENY_ROLE, ComponentIds.ROOM_PERMISSION_MODAL_DENY_ROLE],
};

function matchesIds(...ids) {
    return (customId) => ids.includes(customId);
}

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

function cleanupPanelState() {
    const now = Date.now();
    for (const [key, value] of panelStateMap.entries()) {
        if (value.expiresAt <= now) panelStateMap.delete(key);
    }
}

function getPanelState(messageId, userId) {
    if (!messageId) return { view: 'main', selectedTemplate: null };
    cleanupPanelState();
    const value = panelStateMap.get(`${messageId}:${userId}`);
    return value?.state ?? { view: 'main', selectedTemplate: null };
}

function setPanelState(messageId, userId, state) {
    if (!messageId) return;
    cleanupPanelState();
    panelStateMap.set(`${messageId}:${userId}`, {
        state,
        expiresAt: Date.now() + PANEL_STATE_TTL_MS,
    });
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
        context.member,
        context.room.ownerId,
        context.settings.trustedRoleIds,
        context.settings.roomManagerRoleId,
        scope,
    );
}

function parseMentionOrId(raw) {
    const match = raw.trim().match(/\d{17,20}/);
    if (!match) throw new ValidationError('Provide a valid mention or ID.');
    return match[0];
}

async function assertUserExistsInGuild(member, userId) {
    const target = await member.guild.members.fetch(userId).catch(() => null);
    if (!target) throw new ValidationError('User does not exist in this guild.');
}

function assertRoleExistsInGuild(member, roleId) {
    const role = member.guild.roles.cache.get(roleId);
    if (!role) throw new ValidationError('Role does not exist in this guild.');
    if (role.id === member.guild.roles.everyone.id) {
        throw new ValidationError('Cannot modify everyone role in allow or deny actions.');
    }
}

async function panelPayload(appContext, member, channel, state) {
    const room = await appContext.roomService.getTrackedRoom(channel.id);
    if (!room) return null;

    const owner = await member.guild.members.fetch(room.ownerId).catch(() => member);
    const templates = await appContext.templateService.listTemplates(member.guild.id, member.id);
    const canClaim = canClaimRoom(member, channel, room.ownerId);
    const rendered = renderAuraInterface({ room, owner, channel, templates, canClaim, state });

    return {
        room,
        payload: {
            embeds: [rendered.embed],
            components: rendered.components,
        },
    };
}

async function updateInterfacePanel(appContext, context, payload, sourceMessageId) {
    if (!context.room.panelMessageId) return;
    if (sourceMessageId && sourceMessageId === context.room.panelMessageId) return;

    const channelIds = [context.channel.id, context.settings.interfaceChannelId].filter(Boolean);
    let panelMessage = null;

    for (const channelId of channelIds) {
        const channel = context.member.guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) continue;
        panelMessage = await channel.messages.fetch(context.room.panelMessageId).catch(() => null);
        if (panelMessage) break;
    }

    if (!panelMessage) return;
    await panelMessage.edit(payload).catch(() => null);
}
async function refreshPanel(interaction, appContext, context, nextState) {
    const sourceMessageId = interaction.isMessageComponent() ? interaction.message.id : context.room.panelMessageId;
    const state = nextState ?? getPanelState(sourceMessageId, interaction.user.id);
    const built = await panelPayload(appContext, context.member, context.channel, state);
    if (!built) throw new ValidationError('This voice channel is not a tracked temp room.');

    if (sourceMessageId) {
        setPanelState(sourceMessageId, interaction.user.id, state);
    }

    if (interaction.isMessageComponent()) {
        await interaction.message.edit(built.payload).catch(() => null);
        if (!context.room.panelMessageId) {
            await updateRoomSettings(context.room.channelId, { panelMessageId: interaction.message.id });
            context.room.panelMessageId = interaction.message.id;
        }
    }

    await updateInterfacePanel(
        appContext,
        context,
        built.payload,
        interaction.isMessageComponent() ? interaction.message.id : undefined,
    );
}

async function finalizeAction(interaction, appContext, context, action, detail, nextState) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    await refreshPanel(interaction, appContext, context, nextState);
    await interaction.editReply({
        embeds: [createActionFeedback(action, detail, getRequestId(interaction))],
        ephemeral: true,
    });
}

function computeLockPatch(context, shouldLock) {
    if (shouldLock) {
        const previous = context.room.previousPrivacyMode ?? context.room.privacyMode;
        return {
            privacyMode: context.room.hidden ? 'private' : 'locked',
            previousPrivacyMode: previous,
            locked: true,
            hidden: context.room.hidden,
        };
    }
    return {
        privacyMode: context.room.hidden ? 'private' : context.room.previousPrivacyMode ?? context.room.privacyMode,
        previousPrivacyMode: context.room.hidden ? context.room.previousPrivacyMode : undefined,
        locked: false,
        hidden: context.room.hidden,
    };
}

function computeVisibilityPatch(context, shouldHide) {
    if (shouldHide) {
        const previous = context.room.previousPrivacyMode ?? context.room.privacyMode;
        return {
            privacyMode: 'private',
            previousPrivacyMode: previous,
            locked: context.room.locked,
            hidden: true,
        };
    }
    return {
        privacyMode: context.room.locked ? 'locked' : context.room.previousPrivacyMode ?? context.room.privacyMode,
        previousPrivacyMode: context.room.locked ? context.room.previousPrivacyMode : undefined,
        locked: context.room.locked,
        hidden: false,
    };
}

function buildInfoEmbed(room, channel) {
    return new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle('Room Info')
        .setDescription(`Details for ${channel.toString()}`)
        .addFields(
            { name: 'Channel ID', value: `\`${channel.id}\``, inline: true },
            { name: 'Owner', value: `<@${room.ownerId}>`, inline: true },
            { name: 'Privacy', value: room.privacyMode, inline: true },
            { name: 'Locked', value: room.locked ? 'Yes' : 'No', inline: true },
            { name: 'Hidden', value: room.hidden ? 'Yes' : 'No', inline: true },
            { name: 'User Limit', value: room.userLimit === 0 ? 'Unlimited' : String(room.userLimit), inline: true },
            { name: 'Activity', value: room.activityTag || 'None', inline: true },
            { name: 'Auto Name', value: room.autoNameEnabled ? 'On' : 'Off', inline: true },
            { name: 'Members', value: String(channel.members.size), inline: true },
            { name: 'Note', value: room.note || 'None', inline: false },
        )
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export async function syncInterfacePanel(appContext, context) {
    const built = await panelPayload(appContext, context.member, context.channel, { view: 'main', selectedTemplate: null });
    if (!built) return;
    await updateInterfacePanel(appContext, context, built.payload);
}

export async function handleRoomPanel(interaction, context) {
    const roomContext = await getRoomContext(interaction);
    assertScope(roomContext, 'moderation');
    const built = await panelPayload(context, roomContext.member, roomContext.channel, { view: 'main', selectedTemplate: null });
    if (!built) throw new ValidationError('Unable to load room panel.');
    await interaction.reply({ ...built.payload, ephemeral: true });
}

export const roomCommand = {
    data: new SlashCommandBuilder()
        .setName('room')
        .setDescription('Manage your temp voice room')
        .addSubcommand((sub) => sub.setName('panel').setDescription('Open your room control panel'))
        .addSubcommand((sub) =>
            sub
                .setName('activity')
                .setDescription('Set room activity and auto-name state')
                .addStringOption((o) => o.setName('tag').setDescription('Activity tag').setMaxLength(SafeLimits.MAX_ACTIVITY_TAG_LEN))
                .addBooleanOption((o) => o.setName('autoname').setDescription('Auto name enabled')),
        ),

    async execute(interaction, context) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'panel') {
            await handleRoomPanel(interaction, context);
            return;
        }
        if (subcommand === 'activity') {
            await handleRoomActivity(interaction, context);
            return;
        }
        await interaction.reply({ embeds: [createErrorEmbed('Room', 'Unknown room action.')], ephemeral: true });
    },
};
export const roomButtonHandlers = [
    {
        customId: matchesIds(...CompatIds.rename),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createAuraRenameModal(context.channel.name));
        },
    },
    {
        customId: matchesIds(...CompatIds.limit),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(createAuraLimitModal(context.room.userLimit));
        },
    },
    {
        customId: matchesIds(...CompatIds.allowUser),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(
                createAuraPermissionModal(AuraPanelIds.MODAL_ALLOW_USER, AuraPanelIds.INPUT_ALLOW_USER, 'User mention or ID'),
            );
        },
    },
    {
        customId: matchesIds(...CompatIds.denyUser),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(
                createAuraPermissionModal(AuraPanelIds.MODAL_DENY_USER, AuraPanelIds.INPUT_DENY_USER, 'User mention or ID'),
            );
        },
    },
    {
        customId: matchesIds(...CompatIds.allowRole),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(
                createAuraPermissionModal(AuraPanelIds.MODAL_ALLOW_ROLE, AuraPanelIds.INPUT_ALLOW_ROLE, 'Role mention or ID'),
            );
        },
    },
    {
        customId: matchesIds(...CompatIds.denyRole),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
            await interaction.showModal(
                createAuraPermissionModal(AuraPanelIds.MODAL_DENY_ROLE, AuraPanelIds.INPUT_DENY_ROLE, 'Role mention or ID'),
            );
        },
    },
    {
        customId: matchesIds(...CompatIds.claim),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const cd = checkCooldown(interaction.user.id, 'claim');
            if (cd > 0) {
                await interaction.editReply({ embeds: [createCooldownEmbed(cd)], ephemeral: true });
                return;
            }

            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            if (!canClaimRoom(context.member, context.channel, context.room.ownerId)) {
                throw new ValidationError('Claim is only available when the owner is absent from this room.');
            }

            await transferOwner(context.channel.id, context.member.id);
            await appContext.permissionService.applyPrivacy(
                context.channel,
                context.room.privacyMode,
                context.member.id,
                accessRoleIds(context.settings),
                { locked: context.room.locked, hidden: context.room.hidden },
            );

            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.ROOM_TRANSFERRED,
                result: 'success',
                actorId: context.member.id,
                requestId: getRequestId(interaction),
                details: `Claimed room ${context.channel.id}`,
            });

            await finalizeAction(interaction, appContext, context, 'Claim', 'Owner updated', {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.activity),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            await finalizeAction(interaction, appContext, context, 'Activity', 'Select an activity below', {
                view: 'activity',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.privacy),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            await finalizeAction(interaction, appContext, context, 'Privacy', 'Select a privacy mode', {
                view: 'privacy',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.autoName),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const cd = checkCooldown(interaction.user.id, 'autoname');
            if (cd > 0) {
                await interaction.editReply({ embeds: [createCooldownEmbed(cd)], ephemeral: true });
                return;
            }

            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            const next = !context.room.autoNameEnabled;
            await updateRoomSettings(context.room.channelId, { autoNameEnabled: next, lastActiveAt: new Date() });

            await finalizeAction(interaction, appContext, context, 'Auto Name', next ? 'Enabled' : 'Disabled', {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.lock),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const cd = checkCooldown(interaction.user.id, 'lock');
            if (cd > 0) {
                await interaction.editReply({ embeds: [createCooldownEmbed(cd)], ephemeral: true });
                return;
            }

            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const shouldLock = !context.room.locked;
            const patch = computeLockPatch(context, shouldLock);

            await appContext.permissionService.toggleLock(
                context.channel,
                shouldLock,
                context.room.ownerId,
                accessRoleIds(context.settings),
                context.settings.roomManagerRoleId,
                patch.privacyMode,
                patch.hidden,
            );

            await updateRoomSettings(context.room.channelId, {
                locked: patch.locked,
                hidden: patch.hidden,
                privacyMode: patch.privacyMode,
                previousPrivacyMode: patch.previousPrivacyMode,
                lastActiveAt: new Date(),
            });

            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.LOCK_TOGGLED,
                result: 'success',
                actorId: context.member.id,
                requestId: getRequestId(interaction),
                details: `${shouldLock ? 'Locked' : 'Unlocked'} room ${context.channel.id}`,
            });

            await finalizeAction(interaction, appContext, context, 'Lock', shouldLock ? 'Enabled' : 'Disabled', {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.hide),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const cd = checkCooldown(interaction.user.id, 'hide');
            if (cd > 0) {
                await interaction.editReply({ embeds: [createCooldownEmbed(cd)], ephemeral: true });
                return;
            }

            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const shouldHide = !context.room.hidden;
            const patch = computeVisibilityPatch(context, shouldHide);

            await appContext.permissionService.toggleVisibility(
                context.channel,
                shouldHide,
                context.room.ownerId,
                accessRoleIds(context.settings),
                context.settings.roomManagerRoleId,
                patch.privacyMode,
                patch.locked,
            );

            await updateRoomSettings(context.room.channelId, {
                hidden: patch.hidden,
                locked: patch.locked,
                privacyMode: patch.privacyMode,
                previousPrivacyMode: patch.previousPrivacyMode,
                lastActiveAt: new Date(),
            });

            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.VISIBILITY_TOGGLED,
                result: 'success',
                actorId: context.member.id,
                requestId: getRequestId(interaction),
                details: `${shouldHide ? 'Hidden' : 'Shown'} room ${context.channel.id}`,
            });

            await finalizeAction(interaction, appContext, context, 'Visibility', shouldHide ? 'Hidden' : 'Visible', {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.info),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            await interaction.reply({ embeds: [buildInfoEmbed(context.room, context.channel)], ephemeral: true });
        },
    },
    {
        customId: matchesIds(...CompatIds.permissions),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            await finalizeAction(interaction, appContext, context, 'Permissions', 'Permission actions ready', {
                view: 'permissions',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.templates),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            await finalizeAction(interaction, appContext, context, 'Templates', 'Select a template below', {
                view: 'templates',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.templatesApply),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const state = getPanelState(interaction.message?.id, interaction.user.id);
            const selected = state.selectedTemplate;
            if (!selected) {
                throw new ValidationError('Select a template first.');
            }

            await appContext.templateService.applyTemplateToRoom({
                templateName: selected,
                guildId: context.member.guild.id,
                ownerId: interaction.user.id,
                member: context.member,
                channel: context.channel,
                room: context.room,
                trustedRoleIds: accessRoleIds(context.settings),
                namingPolicy: context.settings.namingPolicy,
            });

            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.TEMPLATE_APPLIED,
                result: 'success',
                actorId: context.member.id,
                requestId: getRequestId(interaction),
                details: `Applied template ${selected}`,
            });

            await finalizeAction(interaction, appContext, context, 'Template Applied', selected, {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.note),
        async execute(interaction) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            await interaction.showModal(createAuraNoteModal(context.room.note ?? ''));
        },
    },
    {
        customId: matchesIds(...CompatIds.kick),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            await finalizeAction(interaction, appContext, context, 'Kick', 'Select a member to remove', {
                view: 'kick',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.refresh),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            await finalizeAction(interaction, appContext, context, 'Refresh', 'Panel updated', {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.backMain),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            await finalizeAction(interaction, appContext, context, 'Back', 'Main panel opened', {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
];

export const roomSelectHandlers = [
    {
        customId: matchesIds(...CompatIds.privacySelect),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const cd = checkCooldown(interaction.user.id, 'privacy');
            if (cd > 0) {
                await interaction.editReply({ embeds: [createCooldownEmbed(cd)], ephemeral: true });
                return;
            }

            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const requestedMode = interaction.values[0];
            const effectiveMode = context.room.hidden ? 'private' : context.room.locked ? 'locked' : requestedMode;
            const previousPrivacyMode = context.room.locked || context.room.hidden ? requestedMode : undefined;

            await appContext.permissionService.applyPrivacy(
                context.channel,
                effectiveMode,
                context.room.ownerId,
                accessRoleIds(context.settings),
                { locked: context.room.locked, hidden: context.room.hidden },
            );

            await updateRoomSettings(context.room.channelId, {
                privacyMode: effectiveMode,
                previousPrivacyMode,
                lastActiveAt: new Date(),
            });

            await appContext.auditLogService.logEvent(context.member.guild.id, {
                eventType: AuditEventTypes.PRIVACY_CHANGED,
                result: 'success',
                actorId: context.member.id,
                requestId: getRequestId(interaction),
                details: `Set privacy ${effectiveMode}`,
            });

            await finalizeAction(interaction, appContext, context, 'Privacy', effectiveMode, {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.kickSelect),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const context = await getRoomContext(interaction);
            assertScope(context, 'moderation');
            assertBotPerms(context.member, [PermissionFlagsBits.MoveMembers], context.channel.id);

            const targetId = interaction.values[0];
            if (targetId === 'none') {
                await interaction.editReply({ embeds: [createInfoEmbed('Kick', 'No member selected.')], ephemeral: true });
                return;
            }

            const targetMember = await context.member.guild.members.fetch(targetId).catch(() => null);
            if (!targetMember || !targetMember.voice.channelId || targetMember.voice.channelId !== context.channel.id) {
                throw new ValidationError('Selected member is not in this room.');
            }

            await targetMember.voice.disconnect();
            await finalizeAction(interaction, appContext, context, 'Kick', `Removed ${targetMember.displayName}`, {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.activitySelect),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');

            const value = interaction.values[0];
            const activityTag = value === 'NONE' ? undefined : value;
            await updateRoomSettings(context.room.channelId, { activityTag, lastActiveAt: new Date() });

            await finalizeAction(interaction, appContext, context, 'Activity', activityTag ?? 'None', {
                view: 'main',
                selectedTemplate: null,
            });
        },
    },
    {
        customId: matchesIds(...CompatIds.templateSelect),
        async execute(interaction, appContext) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');

            const selected = interaction.values[0];
            if (interaction.customId === ComponentIds.ROOM_TEMPLATE_SELECT) {
                if (selected === 'none') {
                    await interaction.editReply({ embeds: [createInfoEmbed('Template', 'No template selected.')], ephemeral: true });
                    return;
                }

                assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);
                await appContext.templateService.applyTemplateToRoom({
                    templateName: selected,
                    guildId: context.member.guild.id,
                    ownerId: interaction.user.id,
                    member: context.member,
                    channel: context.channel,
                    room: context.room,
                    trustedRoleIds: accessRoleIds(context.settings),
                    namingPolicy: context.settings.namingPolicy,
                });

                await finalizeAction(interaction, appContext, context, 'Template Applied', selected, {
                    view: 'main',
                    selectedTemplate: null,
                });
                return;
            }

            await finalizeAction(interaction, appContext, context, 'Template Selected', selected === 'none' ? 'None' : selected, {
                view: 'templates',
                selectedTemplate: selected === 'none' ? null : selected,
            });
        },
    },
];

function readModalInput(interaction, ids) {
    for (const id of ids) {
        const value = interaction.fields.getTextInputValue(id);
        if (typeof value === 'string') return value;
    }
    throw new ValidationError('Missing modal input value.');
}

export const roomModalHandlers = [
    {
        customId: matchesIds(...CompatIds.modalRename),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const nextName = readModalInput(interaction, [AuraPanelIds.INPUT_RENAME, ComponentIds.ROOM_RENAME_INPUT]).trim();
            if (nextName.length === 0 || nextName.length > SafeLimits.MAX_ROOM_NAME_LEN) {
                throw new ValidationError(`Room name must be 1 to ${SafeLimits.MAX_ROOM_NAME_LEN} characters.`);
            }

            await appContext.permissionService.rename(context.channel, nextName, context.settings.namingPolicy);
            await updateRoomSettings(context.room.channelId, { lastActiveAt: new Date() });
            await interaction.reply({ embeds: [createActionFeedback('Rename', nextName, getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'main', selectedTemplate: null });
        },
    },
    {
        customId: matchesIds(...CompatIds.modalLimit),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const raw = readModalInput(interaction, [AuraPanelIds.INPUT_LIMIT, ComponentIds.ROOM_LIMIT_INPUT]).trim();
            const limit = Number(raw);
            if (!Number.isFinite(limit) || !isValidUserLimit(limit)) {
                throw new ValidationError('Limit must be an integer between 0 and 99.');
            }

            await appContext.permissionService.setUserLimit(context.channel, limit);
            await updateRoomSettings(context.room.channelId, { userLimit: limit, lastActiveAt: new Date() });
            await interaction.reply({ embeds: [createActionFeedback('Limit', limit === 0 ? 'Unlimited' : String(limit), getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'main', selectedTemplate: null });
        },
    },
    {
        customId: matchesIds(...CompatIds.modalAllowUser),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const raw = readModalInput(interaction, [AuraPanelIds.INPUT_ALLOW_USER, ComponentIds.ROOM_PERMISSION_INPUT]);
            const userId = parseMentionOrId(raw);
            await assertUserExistsInGuild(context.member, userId);

            await appContext.permissionService.allowUser(
                context.channel,
                context.room.privacyMode,
                context.room.ownerId,
                accessRoleIds(context.settings),
                userId,
                { locked: context.room.locked, hidden: context.room.hidden },
            );

            await interaction.reply({ embeds: [createActionFeedback('Allow User', `<@${userId}>`, getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'permissions', selectedTemplate: null });
        },
    },
    {
        customId: matchesIds(...CompatIds.modalDenyUser),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const raw = readModalInput(interaction, [AuraPanelIds.INPUT_DENY_USER, ComponentIds.ROOM_PERMISSION_INPUT]);
            const userId = parseMentionOrId(raw);
            await assertUserExistsInGuild(context.member, userId);

            await appContext.permissionService.denyUser(
                context.channel,
                context.room.privacyMode,
                context.room.ownerId,
                accessRoleIds(context.settings),
                userId,
                { locked: context.room.locked, hidden: context.room.hidden },
            );

            await interaction.reply({ embeds: [createActionFeedback('Deny User', `<@${userId}>`, getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'permissions', selectedTemplate: null });
        },
    },
    {
        customId: matchesIds(...CompatIds.modalAllowRole),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const raw = readModalInput(interaction, [AuraPanelIds.INPUT_ALLOW_ROLE, ComponentIds.ROOM_PERMISSION_INPUT]);
            const roleId = parseMentionOrId(raw);
            assertRoleExistsInGuild(context.member, roleId);

            await appContext.permissionService.allowRole(
                context.channel,
                context.room.privacyMode,
                context.room.ownerId,
                accessRoleIds(context.settings),
                roleId,
                { locked: context.room.locked, hidden: context.room.hidden },
            );

            await interaction.reply({ embeds: [createActionFeedback('Allow Role', `<@&${roleId}>`, getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'permissions', selectedTemplate: null });
        },
    },
    {
        customId: matchesIds(...CompatIds.modalDenyRole),
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');
            assertBotPerms(context.member, [PermissionFlagsBits.ManageChannels], context.channel.id);

            const raw = readModalInput(interaction, [AuraPanelIds.INPUT_DENY_ROLE, ComponentIds.ROOM_PERMISSION_INPUT]);
            const roleId = parseMentionOrId(raw);
            assertRoleExistsInGuild(context.member, roleId);

            await appContext.permissionService.denyRole(
                context.channel,
                context.room.privacyMode,
                context.room.ownerId,
                accessRoleIds(context.settings),
                roleId,
                { locked: context.room.locked, hidden: context.room.hidden },
            );

            await interaction.reply({ embeds: [createActionFeedback('Deny Role', `<@&${roleId}>`, getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'permissions', selectedTemplate: null });
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

            await updateRoomSettings(context.room.channelId, {
                activityTag: value.length > 0 ? value : undefined,
                lastActiveAt: new Date(),
            });

            await interaction.reply({ embeds: [createActionFeedback('Activity', value || 'Cleared', getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'main', selectedTemplate: null });
        },
    },
    {
        customId: AuraPanelIds.MODAL_NOTE,
        async execute(interaction, appContext) {
            const context = await getRoomContext(interaction);
            assertScope(context, 'full');

            const note = readModalInput(interaction, [AuraPanelIds.INPUT_NOTE]).trim();
            if (note.length > SafeLimits.MAX_ROOM_NOTE_LEN) {
                throw new ValidationError(`Note must be at most ${SafeLimits.MAX_ROOM_NOTE_LEN} characters.`);
            }

            await updateRoomSettings(context.room.channelId, {
                note: note.length > 0 ? note : undefined,
                lastActiveAt: new Date(),
            });

            await interaction.reply({ embeds: [createActionFeedback('Note', note || 'Cleared', getRequestId(interaction))], ephemeral: true });
            await refreshPanel(interaction, appContext, context, { view: 'main', selectedTemplate: null });
        },
    },
];
