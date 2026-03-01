import { randomUUID } from 'node:crypto';

const MAX_EVENTS_PER_GUILD = 50;
const traceStore = new Map();

export function traceEvent(guildId, data) {
    const events = traceStore.get(guildId) ?? [];
    events.push({
        ts: new Date().toISOString(),
        requestId: data.requestId ?? randomUUID().slice(0, 8),
        userId: data.userId ?? null,
        action: data.action,
        lobbyChannelId: data.lobbyChannelId ?? null,
        fromChannelId: data.fromChannelId ?? null,
        toChannelId: data.toChannelId ?? null,
        result: data.result ?? 'pending',
        reason: data.reason ?? null,
    });

    if (events.length > MAX_EVENTS_PER_GUILD) events.splice(0, events.length - MAX_EVENTS_PER_GUILD);
    traceStore.set(guildId, events);
}

export function getTraceEvents(guildId, limit = 10) {
    const events = traceStore.get(guildId) ?? [];
    return events.slice(-limit);
}

export function clearTraceEvents(guildId) {
    traceStore.delete(guildId);
}
