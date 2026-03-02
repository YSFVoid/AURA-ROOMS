const eventOverrides = {
    SETUP_WIZARD_RUN: 'Setup Completed',
    SETUP_EXPORT: 'Setup Exported',
    IMPORT_STAGED: 'Import Staged',
    IMPORT_CONFIRMED: 'Import Confirmed',
    IMPORT_CANCELLED: 'Import Cancelled',
    ROOM_CREATED: 'Room Created',
    ROOM_DELETED: 'Room Deleted',
    ROOM_TRANSFERRED: 'Room Transferred',
    ROOM_CREATE_BLOCKED: 'Room Creation Blocked',
    ROOM_CREATE_FAILED: 'Room Creation Failed',
    PRIVACY_CHANGED: 'Privacy Changed',
    LOCK_TOGGLED: 'Lock Toggled',
    VISIBILITY_TOGGLED: 'Visibility Toggled',
    TEMPLATE_APPLIED: 'Template Applied',
};

const decisionOverrides = {
    CREATE_COOLDOWN: 'Create Cooldown',
    JOIN_LEAVE_LIMIT: 'Join Leave Limit',
    GUILD_RATE_LIMIT: 'Guild Rate Limit',
    MAX_ROOMS: 'Max Rooms Reached',
};

function toTitleCase(value) {
    return value
        .split(' ')
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

export function humanizeKey(input) {
    if (!input) return 'Unknown';
    const normalized = String(input).trim();
    if (normalized.length === 0) return 'Unknown';
    return toTitleCase(normalized.replaceAll('_', ' ').replaceAll('-', ' '));
}

export function humanizeEventKey(input) {
    if (!input) return 'Event';
    return eventOverrides[input] ?? humanizeKey(input);
}

export function humanizeDecisionCode(input) {
    if (!input) return 'Decision';
    return decisionOverrides[input] ?? humanizeKey(input);
}
