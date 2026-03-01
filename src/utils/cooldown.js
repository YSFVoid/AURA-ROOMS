const cooldowns = new Map();

export function isOnCooldown(key) {
    const entry = cooldowns.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
        cooldowns.delete(key);
        return false;
    }
    return true;
}

export function getRemainingCooldownMs(key) {
    const entry = cooldowns.get(key);
    if (!entry) return 0;
    const remaining = entry.expiresAt - Date.now();
    if (remaining <= 0) {
        cooldowns.delete(key);
        return 0;
    }
    return remaining;
}

export function setCooldown(key, durationMs) {
    cooldowns.set(key, { expiresAt: Date.now() + durationMs });
}

export function clearCooldown(key) {
    cooldowns.delete(key);
}

export function makeCooldownKey(scope, guildId, userId) {
    return `${scope}:${guildId}:${userId}`;
}
