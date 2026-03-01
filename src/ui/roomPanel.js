import { EmbedBuilder } from 'discord.js';
import { Branding } from '../config/constants.js';
import { listByChannel } from '../db/repos/permissionsRepo.js';
import { PurpleOS } from './theme.js';
import {
    createRoomControlRowA,
    createRoomControlRowB,
    createRoomKickRow,
    createRoomPermissionButtons,
    createRoomTemplateRow,
} from './components.js';

function privacyLabel(mode) {
    const map = { public: '🌐 Public', locked: '🔒 Locked', private: '🔐 Private' };
    return map[mode] ?? mode;
}

function limitLabel(limit) {
    return limit === 0 ? PurpleOS.Labels.INFINITY : `\`${limit}\``;
}

function toggleLabel(value) {
    return value ? PurpleOS.Labels.ON : PurpleOS.Labels.OFF;
}

function formatUptime(createdAt) {
    if (!createdAt) return PurpleOS.Labels.NONE;
    const ms = Date.now() - new Date(createdAt).getTime();
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `\`${totalSeconds}s\``;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `\`${minutes}m\``;
    const hours = Math.floor(minutes / 60);
    const remainMins = minutes % 60;
    return `\`${hours}h ${remainMins}m\``;
}

export async function buildRoomPanelEmbed(room, channel) {
    const perms = await listByChannel(channel.id);
    const allowedCount = perms.filter((p) => p.action === 'allow').length;
    const deniedCount = perms.filter((p) => p.action === 'deny').length;

    const statusLines = [
        `${PurpleOS.Icons.CHANNEL} **Channel** ${channel.toString()}`,
        `${PurpleOS.Icons.CROWN} **Owner** <@${room.ownerId}>`,
        `${PurpleOS.Icons.PRIVACY} **Privacy** ${privacyLabel(room.privacyMode)}`,
        `${PurpleOS.Icons.LOCK} **Lock** ${toggleLabel(room.locked)}  ${PurpleOS.Icons.BULLET}  ${PurpleOS.Icons.SHOW} **Visibility** ${room.hidden ? '`Hidden`' : '`Visible`'}`,
        `${PurpleOS.Icons.LIMIT} **Limit** ${limitLabel(room.userLimit)}  ${PurpleOS.Icons.BULLET}  **Members** \`${channel.members.size}\``,
        `${PurpleOS.Icons.ACTIVITY} **Activity** ${room.activityTag ? `\`${room.activityTag}\`` : PurpleOS.Labels.NONE}`,
        `${PurpleOS.Icons.AUTONAME} **AutoName** ${toggleLabel(room.autoNameEnabled)}  ${PurpleOS.Icons.BULLET}  ${PurpleOS.Icons.CLOCK} **Uptime** ${formatUptime(room.createdAt)}`,
    ];

    if (room.note) {
        statusLines.push(`${PurpleOS.Icons.NOTE} **Note** \`${room.note}\``);
    }

    const permissionLine = `${PurpleOS.Icons.ALLOW} Allowed \`${allowedCount}\`  ${PurpleOS.Icons.BULLET}  ${PurpleOS.Icons.DENY} Denied \`${deniedCount}\``;

    const sections = [
        PurpleOS.Sections.STATUS,
        statusLines.join('\n'),
        '',
        PurpleOS.Divider,
        '',
        PurpleOS.Sections.PERMISSIONS,
        permissionLine,
        '',
        PurpleOS.DividerThin,
        '',
        `-# ${PurpleOS.Text.HINT_LOCK}`,
        `-# ${PurpleOS.Text.HINT_LOG}`,
    ];

    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.PRIMARY)
        .setTitle(`${PurpleOS.Icons.SPARKLE} ${PurpleOS.Text.PANEL_TITLE}`)
        .setDescription(sections.join('\n'))
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export async function buildRoomPanelComponents(params) {
    const perms = await listByChannel(params.channel.id);
    const allowedCount = perms.filter((p) => p.action === 'allow').length;
    const deniedCount = perms.filter((p) => p.action === 'deny').length;

    const kickOptions = params.channel.members
        .filter((member) => !member.user.bot)
        .map((member) => ({
            label: member.displayName.slice(0, 100),
            value: member.id,
            description: member.id === params.room.ownerId ? '👑 Owner' : undefined,
        }));

    const templateOptions = params.templates.map((template) => ({
        label: template.name.slice(0, 100),
        value: template.name,
        description: `${privacyLabel(template.privacyMode)} • limit ${template.userLimit}`.slice(0, 100),
    }));

    const rows = [
        createRoomControlRowA(params.room.locked, params.room.hidden),
        createRoomControlRowB(params.canClaim),
        createRoomPermissionButtons(allowedCount, deniedCount),
    ];

    if (kickOptions.length > 0 || templateOptions.length > 0) {
        if (kickOptions.length > 0) rows.push(createRoomKickRow(kickOptions));
        else rows.push(createRoomTemplateRow(templateOptions));

        if (rows.length < 5 && kickOptions.length > 0 && templateOptions.length > 0) {
            rows.push(createRoomTemplateRow(templateOptions));
        }
    }

    return rows;
}
