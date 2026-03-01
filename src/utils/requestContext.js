import { randomUUID } from 'node:crypto';

const requestIdStore = new WeakMap();

export function createRequestId() {
    return randomUUID();
}

export function attachRequestId(interaction, requestId) {
    requestIdStore.set(interaction, requestId);
}

export function getRequestId(interaction) {
    return requestIdStore.get(interaction) ?? 'unknown';
}
