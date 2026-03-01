import { EmbedBuilder } from 'discord.js';
import { Branding } from '../config/constants.js';
import { PurpleOS } from './theme.js';

export function createPurpleEmbed({ title, subtitle, kind = 'PURPLEOS_PRIMARY', fields = [] }) {
    const color = PurpleOS.Colors[kind] ?? PurpleOS.Colors.PURPLEOS_PRIMARY;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();

    if (subtitle) {
        embed.setDescription(`*${subtitle}*`);
    }

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

export function createSuccessEmbed(title, description, fields = []) {
    return createPurpleEmbed({
        title: `${PurpleOS.Icons.CHECK} ${title}`,
        subtitle: description,
        kind: 'PURPLEOS_SUCCESS',
        fields,
    });
}

export function createErrorEmbed(title, description, fields = []) {
    return createPurpleEmbed({
        title: `${PurpleOS.Icons.DENY} ${title}`,
        subtitle: description,
        kind: 'PURPLEOS_DANGER',
        fields,
    });
}

export function createInfoEmbed(title, description, fields = []) {
    return createPurpleEmbed({
        title: `${PurpleOS.Icons.SPARKLE} ${title}`,
        subtitle: description,
        kind: 'PURPLEOS_PRIMARY',
        fields,
    });
}

export function createActionFeedback(action, detail, requestId) {
    const fields = [{ name: 'Action', value: action, inline: true }];
    if (detail) fields.push({ name: 'Detail', value: detail, inline: true });
    if (requestId) fields.push({ name: 'Request', value: `\`${requestId}\``, inline: true });

    return createPurpleEmbed({
        title: `${PurpleOS.Icons.CHECK} Applied`,
        kind: 'PURPLEOS_PRIMARY',
        fields,
    });
}

export function createCooldownEmbed(secondsLeft) {
    return createPurpleEmbed({
        title: `${PurpleOS.Icons.CLOCK} Slow down`,
        subtitle: `Try again in **${secondsLeft}s**.`,
        kind: 'PURPLEOS_WARN',
    });
}
