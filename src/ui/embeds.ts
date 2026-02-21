import { EmbedBuilder, type APIEmbedField } from 'discord.js';
import { Branding, Colors } from '../config/constants.js';

export function createInfoEmbed(
  title: string,
  description: string,
  fields: APIEmbedField[] = [],
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setFooter({ text: Branding.FOOTER })
    .setTimestamp();
}

export function createSuccessEmbed(
  title: string,
  description: string,
  fields: APIEmbedField[] = [],
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setFooter({ text: Branding.FOOTER })
    .setTimestamp();
}

export function createErrorEmbed(
  title: string,
  description: string,
  fields: APIEmbedField[] = [],
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setFooter({ text: Branding.FOOTER })
    .setTimestamp();
}
