import { EmbedBuilder } from 'discord.js';
import { Branding } from '../config/constants.js';
import { PurpleOS } from './theme.js';
import {
    createAuraActivityActionRow,
    createAuraActivitySelect,
    createAuraBackActionRow,
    createAuraKickSelect,
    createAuraMainGridRows,
    createAuraPermissionsRow,
    createAuraPrivacySelect,
    createAuraTemplateActionRow,
    createAuraTemplateSelect,
} from './components.js';

function privacyLabel(mode) {
    if (mode === 'public') return 'Public';
    if (mode === 'locked') return 'Locked';
    return 'Private';
}

function onOff(value) {
    return value ? 'On' : 'Off';
}

function limitLabel(limit) {
    return limit === 0 ? 'Unlimited' : String(limit);
}

function buildKickOptions(channel, ownerId) {
    return channel.members
        .filter((member) => !member.user.bot)
        .map((member) => ({
            label: member.displayName.slice(0, 100),
            value: member.id,
            description: member.id === ownerId ? 'Owner' : undefined,
        }));
}

function buildTemplateOptions(templates) {
    return templates.map((template) => ({
        label: template.name.slice(0, 100),
        value: template.name,
        description: `${privacyLabel(template.privacyMode)} \u2022 ${template.userLimit === 0 ? 'Unlimited' : `Limit ${template.userLimit}`}`.slice(0, 100),
    }));
}

function buildBaseEmbed(room, channel, state) {
    const headerLine = `<@${room.ownerId}> Use the buttons below to manage your voice channel.`;
    const lineRoom = `${PurpleOS.Icons.CHANNEL} Room <#${channel.id}>`;
    const lineOwner = `${PurpleOS.Icons.CROWN} Owner <@${room.ownerId}>`;
    const lineStats = `${PurpleOS.Icons.SHIELD} ${privacyLabel(room.privacyMode)} ${PurpleOS.Icons.DOT} Limit ${limitLabel(room.userLimit)} ${PurpleOS.Icons.DOT} ${channel.members.size} members`;
    const lineFlags = `${PurpleOS.Icons.LOCK} Lock ${onOff(room.locked)} ${PurpleOS.Icons.DOT} ${PurpleOS.Icons.EYE} Hidden ${onOff(room.hidden)} ${PurpleOS.Icons.DOT} ${PurpleOS.Icons.AUTONAME} Auto Name ${onOff(room.autoNameEnabled)}`;
    const lineNote = room.note ? `${PurpleOS.Icons.NOTE} ${room.note}` : null;

    const descriptionLines = [
        headerLine,
        '',
        lineRoom,
        lineOwner,
        lineStats,
        lineFlags,
    ];

    if (lineNote) descriptionLines.push(lineNote);

    if (state.view === 'templates') descriptionLines.push('', state.selectedTemplate ? `${PurpleOS.Icons.TEMPLATE} Selected: ${state.selectedTemplate}` : `${PurpleOS.Icons.TEMPLATE} Select a template.`);
    if (state.view === 'permissions') descriptionLines.push('', `${PurpleOS.Icons.SHIELD} Permission controls.`);
    if (state.view === 'privacy') descriptionLines.push('', `${PurpleOS.Icons.LOCK} Select privacy mode.`);
    if (state.view === 'kick') descriptionLines.push('', `${PurpleOS.Icons.KICK} Select member to remove.`);
    if (state.view === 'activity') descriptionLines.push('', `${PurpleOS.Icons.ACTIVITY} Current Activity: ${room.activityTag ?? 'None'}`);

    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.PURPLEOS_PRIMARY)
        .setTitle(`${PurpleOS.Icons.SPARKLE} AURA Rooms Interface`)
        .setDescription(descriptionLines.join('\n'))
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export function renderMain({ room, channel, canClaim }) {
    const embed = buildBaseEmbed(room, channel, { view: 'main', selectedTemplate: null });
    return {
        embed,
        components: [...createAuraMainGridRows(room, canClaim)],
    };
}

export function renderPermissions({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'permissions', selectedTemplate: null });
    return {
        embed,
        components: [createAuraPermissionsRow()],
    };
}

export function renderTemplates({ room, channel, templates, state }) {
    const selectedTemplate = state?.selectedTemplate ?? null;
    const templateOptions = buildTemplateOptions(templates ?? []);
    const embed = buildBaseEmbed(room, channel, { view: 'templates', selectedTemplate });
    return {
        embed,
        components: [
            createAuraTemplateSelect(templateOptions, selectedTemplate),
            createAuraTemplateActionRow(Boolean(selectedTemplate && selectedTemplate !== 'none')),
        ],
    };
}

export function renderPrivacy({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'privacy', selectedTemplate: null });
    return {
        embed,
        components: [createAuraPrivacySelect(room.privacyMode), createAuraBackActionRow()],
    };
}

export function renderKick({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'kick', selectedTemplate: null });
    const kickOptions = buildKickOptions(channel, room.ownerId);
    return {
        embed,
        components: [createAuraKickSelect(kickOptions), createAuraBackActionRow()],
    };
}

export function renderActivity({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'activity', selectedTemplate: null });
    return {
        embed,
        components: [
            createAuraActivitySelect(room.activityTag ?? null),
            createAuraActivityActionRow(),
        ],
    };
}

export function renderAuraInterface(params) {
    const state = params.state ?? { view: 'main', selectedTemplate: null };
    if (state.view === 'permissions') return renderPermissions(params);
    if (state.view === 'templates') return renderTemplates({ ...params, state });
    if (state.view === 'privacy') return renderPrivacy(params);
    if (state.view === 'kick') return renderKick(params);
    if (state.view === 'activity') return renderActivity(params);
    return renderMain(params);
}
