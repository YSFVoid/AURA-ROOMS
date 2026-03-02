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
    createAuraIconButton,
} from './components.js';
import { AuraPanelIds } from '../config/constants.js';
import { ActionRowBuilder } from 'discord.js';

function privacyLabel(mode) {
    if (mode === 'public') return 'Public';
    if (mode === 'locked') return 'Locked';
    return 'Private';
}

function limitLabel(limit) {
    return limit === 0 ? 'Unlimited' : String(limit);
}

function onOff(value) {
    return value ? 'On' : 'Off';
}

function buildTemplateOptions(templates) {
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

function buildBaseEmbed(room, channel, state) {
    const lines = [
        `> <@${room.ownerId}> Use the buttons below to manage your voice channel.`,
        '',
        `${PurpleOS.Icons.CHANNEL} **Room** <#${channel.id}>`,
        `${PurpleOS.Icons.CROWN} **Owner** <@${room.ownerId}>`,
        `${PurpleOS.Icons.SHIELD} **Privacy** ${privacyLabel(room.privacyMode)} ${PurpleOS.Icons.DOT} **Limit** ${limitLabel(room.userLimit)} ${PurpleOS.Icons.DOT} **Members** ${channel.members.size}`,
        `${PurpleOS.Icons.LOCK} **Lock** ${onOff(room.locked)} ${PurpleOS.Icons.DOT} ${PurpleOS.Icons.EYE} **Hidden** ${onOff(room.hidden)} ${PurpleOS.Icons.DOT} ${PurpleOS.Icons.AUTONAME} **Auto Name** ${onOff(room.autoNameEnabled)}`,
    ];

    if (room.activityTag) lines.push(`${PurpleOS.Icons.ACTIVITY} **Activity** ${room.activityTag}`);
    if (room.note) lines.push(`${PurpleOS.Icons.NOTE} ${room.note}`);

    if (state.view === 'permissions') lines.push('', `> ${PurpleOS.Icons.SHIELD} Select a permission action below.`);
    if (state.view === 'templates') lines.push('', `> ${PurpleOS.Icons.TEMPLATE} ${state.selectedTemplate ? `Selected: **${state.selectedTemplate}**` : 'Select a template.'}`);
    if (state.view === 'privacy') lines.push('', `> ${PurpleOS.Icons.LOCK} Select privacy mode.`);
    if (state.view === 'kick') lines.push('', `> ${PurpleOS.Icons.KICK} Select a member to remove.`);
    if (state.view === 'activity') lines.push('', `> ${PurpleOS.Icons.ACTIVITY} Current Activity: **${room.activityTag ?? 'None'}**`);
    if (state.view === 'admin') lines.push('', `> ${PurpleOS.Icons.INFO} Admin tools and room health.`);
    if (state.view === 'music') lines.push('', `> \ud83c\udfb5 Music controls (coming soon).`);

    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.PURPLEOS_PRIMARY)
        .setTitle('AURA Rooms Interface')
        .setDescription(lines.join('\n'))
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export function renderMain({ room, channel, canClaim }) {
    const embed = buildBaseEmbed(room, channel, { view: 'main', selectedTemplate: null });
    return { embed, components: [...createAuraMainGridRows(room, canClaim)] };
}

export function renderPermissions({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'permissions', selectedTemplate: null });
    return { embed, components: [createAuraPermissionsRow()] };
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
    return { embed, components: [createAuraPrivacySelect(room.privacyMode), createAuraBackActionRow()] };
}

export function renderKick({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'kick', selectedTemplate: null });
    const kickOptions = buildKickOptions(channel, room.ownerId);
    return { embed, components: [createAuraKickSelect(kickOptions), createAuraBackActionRow()] };
}

export function renderActivity({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'activity', selectedTemplate: null });
    return {
        embed,
        components: [createAuraActivitySelect(room.activityTag ?? null), createAuraActivityActionRow()],
    };
}

export function renderAdmin({ room, channel }) {
    const embed = buildBaseEmbed(room, channel, { view: 'admin', selectedTemplate: null });
    const row = new ActionRowBuilder().addComponents(
        createAuraIconButton({ customId: AuraPanelIds.NOTE, icon: '\ud83d\udcdd' }),
        createAuraIconButton({ customId: AuraPanelIds.INFO, icon: '\u2139\ufe0f' }),
        createAuraIconButton({ customId: AuraPanelIds.REFRESH, icon: '\ud83d\udd04' }),
        createAuraIconButton({ customId: AuraPanelIds.BACK_VIEW, icon: '\u21a9' }),
    );
    return { embed, components: [row] };
}

export function renderMusic({ room, channel, musicStatus }) {
    const embed = buildBaseEmbed(room, channel, { view: 'music', selectedTemplate: null });

    if (musicStatus) {
        const lines = [];
        if (musicStatus.current) lines.push(`\u25b6\ufe0f **Now Playing:** ${musicStatus.current.title}`);
        else lines.push('\u25b6\ufe0f **Now Playing:** Nothing');
        if (musicStatus.queueLength > 0) {
            lines.push(`\ud83d\udcdc **Queue:** ${musicStatus.queueLength} track${musicStatus.queueLength > 1 ? 's' : ''}`);
        }
        lines.push(`\ud83d\udd01 **Loop:** ${musicStatus.loopMode} ${PurpleOS.Icons.DOT} \ud83d\udd09 **Vol:** ${musicStatus.volume}%`);
        const desc = embed.data.description + '\n\n' + lines.join('\n');
        embed.setDescription(desc);
    }

    const row1 = new ActionRowBuilder().addComponents(
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_PLAY, icon: '\u25b6\ufe0f' }),
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_PAUSE, icon: '\u23f8\ufe0f' }),
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_RESUME, icon: '\u23ef\ufe0f' }),
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_SKIP, icon: '\u23ed\ufe0f' }),
    );
    const row2 = new ActionRowBuilder().addComponents(
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_STOP, icon: '\ud83d\uded1' }),
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_LOOP, icon: '\ud83d\udd01' }),
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_VOLUME, icon: '\ud83d\udd09' }),
        createAuraIconButton({ customId: AuraPanelIds.MUSIC_QUEUE, icon: '\ud83d\udcdc' }),
        createAuraIconButton({ customId: AuraPanelIds.BACK_VIEW, icon: '\u21a9' }),
    );
    return { embed, components: [row1, row2] };
}

export function renderAuraInterface(params) {
    const state = params.state ?? { view: 'main', selectedTemplate: null };
    if (state.view === 'permissions') return renderPermissions(params);
    if (state.view === 'templates') return renderTemplates({ ...params, state });
    if (state.view === 'privacy') return renderPrivacy(params);
    if (state.view === 'kick') return renderKick(params);
    if (state.view === 'activity') return renderActivity(params);
    if (state.view === 'admin') return renderAdmin(params);
    if (state.view === 'music') return renderMusic(params);
    return renderMain(params);
}
