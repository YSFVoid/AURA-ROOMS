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

function buildTemplateOptions(templates) {
    const privacyLabel = (m) => m === 'public' ? 'Public' : m === 'locked' ? 'Locked' : 'Private';
    return templates.map((template) => ({
        label: template.name.slice(0, 100),
        value: template.name,
        description: `${privacyLabel(template.privacyMode)} \u2022 ${template.userLimit === 0 ? 'Unlimited' : `Limit ${template.userLimit}`}`.slice(0, 100),
    }));
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

function buildBaseEmbed(room, state) {
    const description = `> <@${room.ownerId}> Use the buttons below to manage your voice channel.`;

    const embed = new EmbedBuilder()
        .setColor(PurpleOS.Colors.PURPLEOS_PRIMARY)
        .setTitle('AURA Interface')
        .setDescription(description)
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();

    if (state.view === 'permissions') {
        embed.setDescription(`${description}\n\n> ${PurpleOS.Icons.SHIELD} Select a permission action below.`);
    } else if (state.view === 'templates') {
        const tmpl = state.selectedTemplate ? `Selected: **${state.selectedTemplate}**` : 'Select a template.';
        embed.setDescription(`${description}\n\n> ${PurpleOS.Icons.TEMPLATE} ${tmpl}`);
    } else if (state.view === 'privacy') {
        embed.setDescription(`${description}\n\n> ${PurpleOS.Icons.LOCK} Select privacy mode.`);
    } else if (state.view === 'kick') {
        embed.setDescription(`${description}\n\n> ${PurpleOS.Icons.KICK} Select a member to remove.`);
    } else if (state.view === 'activity') {
        const tag = room.activityTag ?? 'None';
        embed.setDescription(`${description}\n\n> ${PurpleOS.Icons.ACTIVITY} Current Activity: **${tag}**`);
    }

    return embed;
}

export function renderMain({ room, canClaim }) {
    const embed = buildBaseEmbed(room, { view: 'main', selectedTemplate: null });
    return {
        embed,
        components: [...createAuraMainGridRows(room, canClaim)],
    };
}

export function renderPermissions({ room }) {
    const embed = buildBaseEmbed(room, { view: 'permissions', selectedTemplate: null });
    return {
        embed,
        components: [createAuraPermissionsRow()],
    };
}

export function renderTemplates({ room, templates, state }) {
    const selectedTemplate = state?.selectedTemplate ?? null;
    const templateOptions = buildTemplateOptions(templates ?? []);
    const embed = buildBaseEmbed(room, { view: 'templates', selectedTemplate });
    return {
        embed,
        components: [
            createAuraTemplateSelect(templateOptions, selectedTemplate),
            createAuraTemplateActionRow(Boolean(selectedTemplate && selectedTemplate !== 'none')),
        ],
    };
}

export function renderPrivacy({ room }) {
    const embed = buildBaseEmbed(room, { view: 'privacy', selectedTemplate: null });
    return {
        embed,
        components: [createAuraPrivacySelect(room.privacyMode), createAuraBackActionRow()],
    };
}

export function renderKick({ room, channel }) {
    const embed = buildBaseEmbed(room, { view: 'kick', selectedTemplate: null });
    const kickOptions = buildKickOptions(channel, room.ownerId);
    return {
        embed,
        components: [createAuraKickSelect(kickOptions), createAuraBackActionRow()],
    };
}

export function renderActivity({ room }) {
    const embed = buildBaseEmbed(room, { view: 'activity', selectedTemplate: null });
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
