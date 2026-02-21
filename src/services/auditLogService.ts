import type { APIEmbedField, Client, GuildTextBasedChannel } from 'discord.js';
import { get as getGuildSettings } from '../db/repos/guildSettingsRepo.js';
import { createInfoEmbed } from '../ui/embeds.js';
import { logger } from '../utils/logger.js';

export interface AuditEventInput {
  action: string;
  result: 'success' | 'failure' | 'blocked' | 'info';
  actorId?: string;
  requestId?: string;
  details?: string;
  fields?: APIEmbedField[];
}

export class AuditLogService {
  public constructor(private readonly client: Client) {}

  public async log(
    guildId: string,
    title: string,
    description: string,
    fields: APIEmbedField[] = [],
  ): Promise<void> {
    await this.send(guildId, title, description, fields);
  }

  public async logEvent(guildId: string, event: AuditEventInput): Promise<void> {
    const fields: APIEmbedField[] = [...(event.fields ?? [])];

    if (event.actorId) {
      fields.push({ name: 'Actor', value: `<@${event.actorId}>`, inline: true });
    }

    if (event.requestId) {
      fields.push({ name: 'Request ID', value: `\`${event.requestId}\``, inline: true });
    }

    fields.push({ name: 'Result', value: event.result, inline: true });

    const description = event.details ?? 'No additional details';
    await this.send(guildId, `Security: ${event.action}`, description, fields);
  }

  private async send(
    guildId: string,
    title: string,
    description: string,
    fields: APIEmbedField[],
  ): Promise<void> {
    const settings = await getGuildSettings(guildId);
    const logChannelId = settings?.logChannelId;

    if (!logChannelId) {
      logger.info({ guildId, title, description, fields }, 'Audit log fallback');
      return;
    }

    try {
      const channel = (await this.client.channels.fetch(logChannelId)) as GuildTextBasedChannel | null;
      if (!channel || !channel.isTextBased()) {
        logger.warn({ guildId, logChannelId }, 'Configured log channel is unavailable');
        return;
      }

      await channel.send({
        embeds: [createInfoEmbed(title, description, fields)],
      });
    } catch (error) {
      logger.warn({ error, guildId, logChannelId }, 'Failed to send audit log');
    }
  }
}
