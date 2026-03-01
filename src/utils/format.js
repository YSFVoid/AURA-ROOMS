import { SafeLimits } from '../config/safeLimits.js';

export function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const chunks = [];

    if (days > 0) chunks.push(`${days}d`);
    if (hours > 0 || days > 0) chunks.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) chunks.push(`${minutes}m`);
    chunks.push(`${seconds}s`);
    return chunks.join(' ');
}

export function interpolateTemplate(template, member) {
    return template
        .replaceAll('{displayName}', member.displayName)
        .replaceAll('{username}', member.user.username)
        .replaceAll('{tag}', member.user.tag)
        .replaceAll('{id}', member.id)
        .replaceAll('{memberCount}', String(member.guild.memberCount));
}

export function truncate(input, maxLength) {
    if (input.length <= maxLength) return input;
    if (maxLength <= 3) return input.slice(0, maxLength);
    return `${input.slice(0, maxLength - 3)}...`;
}

export function sanitizeRoomName(input, policy) {
    const withoutMassMentions = input.replace(/@everyone/gi, 'everyone').replace(/@here/gi, 'here');
    const normalizedWhitespace = withoutMassMentions.replace(/\s+/g, ' ').trim();

    const normalized =
        policy === 'strict'
            ? normalizedWhitespace
                .replace(/[*_`~|>#()[\]]/g, '')
                .split('')
                .filter((char) => {
                    const code = char.charCodeAt(0);
                    return code >= 32 && code !== 127;
                })
                .join('')
                .replace(/\s+/g, ' ')
                .trim()
            : normalizedWhitespace;

    const safe = normalized.length > 0 ? normalized : 'room';
    return truncate(safe, SafeLimits.MAX_ROOM_NAME_LEN);
}

export function formatRelativeTimestamp(date) {
    return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function formatAbsoluteTimestamp(date) {
    return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}
