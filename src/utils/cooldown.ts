interface CooldownEntry {
  expiresAt: number;
}

const cooldowns = new Map<string, CooldownEntry>();

export function isOnCooldown(key: string): boolean {
  const entry = cooldowns.get(key);
  if (!entry) {
    return false;
  }

  if (Date.now() >= entry.expiresAt) {
    cooldowns.delete(key);
    return false;
  }

  return true;
}

export function getRemainingCooldownMs(key: string): number {
  const entry = cooldowns.get(key);
  if (!entry) {
    return 0;
  }

  const remaining = entry.expiresAt - Date.now();
  if (remaining <= 0) {
    cooldowns.delete(key);
    return 0;
  }

  return remaining;
}

export function setCooldown(key: string, durationMs: number): void {
  cooldowns.set(key, { expiresAt: Date.now() + durationMs });
}

export function clearCooldown(key: string): void {
  cooldowns.delete(key);
}

export function makeCooldownKey(scope: string, guildId: string, userId: string): string {
  return `${scope}:${guildId}:${userId}`;
}
