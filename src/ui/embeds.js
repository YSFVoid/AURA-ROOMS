import { EmbedBuilder } from 'discord.js';
import { Branding } from '../config/constants.js';
import { PurpleOS } from './theme.js';

export function createInfoEmbed(title, description, fields = []) {
    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.PRIMARY)
        .setTitle(`${PurpleOS.Icons.SPARKLE} ${title}`)
        .setDescription(description)
        .addFields(fields)
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export function createSuccessEmbed(title, description, fields = []) {
    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.SUCCESS)
        .setTitle(`${PurpleOS.Icons.CHECK} ${title}`)
        .setDescription(description)
        .addFields(fields)
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export function createErrorEmbed(title, description, fields = []) {
    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.DANGER)
        .setTitle(`${PurpleOS.Icons.DENY} ${title}`)
        .setDescription(description)
        .addFields(fields)
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export function createActionFeedback(action, detail, requestId) {
    const fields = [{ name: 'Action', value: action, inline: true }];
    if (detail) fields.push({ name: 'Detail', value: detail, inline: true });
    if (requestId) fields.push({ name: 'Request', value: `\`${requestId}\``, inline: true });

    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.ACCENT)
        .setTitle(`${PurpleOS.Icons.CHECK} Applied`)
        .addFields(fields)
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();
}

export function createCooldownEmbed(secondsLeft) {
    return new EmbedBuilder()
        .setColor(PurpleOS.Colors.WARNING)
        .setTitle(`${PurpleOS.Icons.CLOCK} Slow down`)
        .setDescription(`Try again in **${secondsLeft}s**.`)
        .setFooter({ text: Branding.FOOTER });
}
