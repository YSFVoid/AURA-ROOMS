import { listByChannel } from '../db/repos/permissionsRepo.js';
import { PurpleOS } from './theme.js';
import { createPurpleEmbed } from './embeds.js';
import {
    createRoomControlRowA,
    createRoomControlRowB,
    createRoomKickRow,
    createRoomPrivacyRow,
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
    const ms = Math.max(0, Date.now() - new Date(createdAt).getTime());
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `\`${totalSeconds}s\``;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `\`${minutes}m\``;
    const hours = Math.floor(minutes / 60);
    const remainMins = minutes % 60;
    return `\`${hours}h ${remainMins}m\``;
}

export async function buildRoomPanelEmbed(room, channel) {
    const uptime = formatUptime(room.createdAt);

    return createPurpleEmbed({
        title: `${PurpleOS.Icons.SPARKLE} ${PurpleOS.Text.PANEL_TITLE}`,
        subtitle: PurpleOS.Text.PANEL_SUBTITLE,
        kind: 'PURPLEOS_PRIMARY',
        fields: [
            { name: `${PurpleOS.Icons.CHANNEL} Room`, value: channel.toString(), inline: true },
            { name: `${PurpleOS.Icons.CROWN} Owner`, value: `<@${room.ownerId}>`, inline: true },
            { name: `${PurpleOS.Icons.PRIVACY} Privacy`, value: privacyLabel(room.privacyMode), inline: true },

            { name: `${PurpleOS.Icons.LOCK} Lock`, value: toggleLabel(room.locked), inline: true },
            { name: `${PurpleOS.Icons.EYE} Visibility`, value: room.hidden ? '`Hidden`' : '`Visible`', inline: true },
            { name: `${PurpleOS.Icons.LIMIT} Limit`, value: limitLabel(room.userLimit), inline: true },

            { name: `${PurpleOS.Icons.ACTIVITY} Activity`, value: room.activityTag ? `\`${room.activityTag}\`` : PurpleOS.Labels.NONE, inline: true },
            { name: `${PurpleOS.Icons.AUTONAME} AutoName`, value: toggleLabel(room.autoNameEnabled), inline: true },
            { name: `${PurpleOS.Icons.CLOCK} Age`, value: uptime, inline: true },
        ],
    });
}

export async function buildRoomPanelComponents(params) {
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
        createRoomPrivacyRow(params.room.privacyMode),
    ];

    if (kickOptions.length > 0) {
        rows.push(createRoomKickRow(kickOptions));
    }
    if (templateOptions.length > 0 && rows.length < 5) {
        rows.push(createRoomTemplateRow(templateOptions));
    }

    return rows;
}
