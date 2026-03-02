import { Defaults } from '../config/constants.js';
import { get as getGuildSettings } from '../db/repos/guildSettingsRepo.js';
import { createInfoEmbed } from '../ui/embeds.js';
import { humanizeEventKey, humanizeKey } from '../utils/humanize.js';
import { logger } from '../utils/logger.js';

function shouldEmit(level, configured) {
    if (configured === 'verbose') return true;
    if (configured === 'normal') return level === 'normal' || level === 'minimal';
    return level === 'minimal';
}

export class AuditLogService {
    constructor(client) {
        this.client = client;
    }

    async log(guildId, title, description, fields = []) {
        await this.send(guildId, title, description, fields);
    }

    async logEvent(guildId, event) {
        const settings = await getGuildSettings(guildId);
        const configuredLevel = settings?.logVerbosity ?? Defaults.LOG_VERBOSITY;
        const level = event.level ?? 'normal';
        const eventType = event.eventType ?? event.action ?? 'EVENT';
        const eventLabel = humanizeEventKey(eventType);

        if (!shouldEmit(level, configuredLevel)) return;

        const fields = [...(event.fields ?? [])];
        fields.push({ name: 'Event', value: eventLabel, inline: true });
        if (event.actorId) fields.push({ name: 'Actor', value: `<@${event.actorId}>`, inline: true });
        if (event.requestId) fields.push({ name: 'Request ID', value: `\`${event.requestId}\``, inline: true });
        fields.push({ name: 'Result', value: humanizeKey(event.result ?? 'unknown'), inline: true });

        const actionValue = event.action ?? eventType;
        fields.push({ name: 'Action', value: humanizeEventKey(actionValue), inline: true });

        const description = event.details ?? 'No additional details';
        await this.send(guildId, `Security: ${eventLabel}`, description, fields);
    }

    async send(guildId, title, description, fields) {
        const settings = await getGuildSettings(guildId);
        const logChannelId = settings?.logChannelId;

        if (!logChannelId) {
            logger.info({ guildId, title }, 'Audit log fallback');
            return;
        }

        try {
            const channel = await this.client.channels.fetch(logChannelId);
            if (!channel || !channel.isTextBased()) {
                logger.warn({ guildId, logChannelId }, 'Configured log channel is unavailable');
                return;
            }

            await channel.send({ embeds: [createInfoEmbed(title, description, fields)] });
        } catch (error) {
            logger.warn({ error, guildId, logChannelId }, 'Failed to send audit log');
        }
    }
}
