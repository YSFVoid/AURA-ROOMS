import type { GuildMember } from 'discord.js';

export function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const chunks: string[] = [];

  if (days > 0) {
    chunks.push(`${days}d`);
  }

  if (hours > 0 || days > 0) {
    chunks.push(`${hours}h`);
  }

  if (minutes > 0 || hours > 0 || days > 0) {
    chunks.push(`${minutes}m`);
  }

  chunks.push(`${seconds}s`);
  return chunks.join(' ');
}

export function interpolateTemplate(template: string, member: GuildMember): string {
  return template
    .replaceAll('{displayName}', member.displayName)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{tag}', member.user.tag)
    .replaceAll('{id}', member.id)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  if (maxLength <= 3) {
    return input.slice(0, maxLength);
  }

  return `${input.slice(0, maxLength - 3)}...`;
}

export function formatRelativeTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function formatAbsoluteTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}
