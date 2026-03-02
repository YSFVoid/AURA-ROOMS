import { Defaults } from '../config/constants.js';
import { SafeLimits } from '../config/safeLimits.js';
import { decrementActiveRooms, getState, incrementActiveRooms, recordCreateAttempt, recordJoinLeaveEvent } from '../db/repos/abuseRepo.js';
import { countActiveByOwner } from '../db/repos/roomsRepo.js';
import { clearCooldown, getRemainingCooldownMs, isOnCooldown, makeCooldownKey, setCooldown } from '../utils/cooldown.js';

export class AbuseService {
    constructor() {
        this.guildCreateEvents = new Map();
    }

    async enforceJoinLeaveLimiter(guildId, userId) {
        const count = await recordJoinLeaveEvent(guildId, userId, new Date(), Defaults.JOIN_LEAVE_WINDOW_MS);

        if (count > Defaults.JOIN_LEAVE_MAX_EVENTS) {
            return { allowed: false, code: 'JOIN_LEAVE_LIMIT', message: 'Too many rapid voice join/leave actions. Please wait a bit.' };
        }

        return { allowed: true, code: 'OK' };
    }

    enforceGuildCreateRateLimit(guildId) {
        const now = Date.now();
        const windowStart = now - SafeLimits.GUILD_CREATE_WINDOW_MS;
        const existing = this.guildCreateEvents.get(guildId) ?? [];
        const recent = existing.filter((ts) => ts >= windowStart);

        if (recent.length >= SafeLimits.GUILD_CREATE_MAX) {
            return { allowed: false, code: 'GUILD_RATE_LIMIT', message: 'Guild room creation rate limit reached. Try again shortly.' };
        }

        recent.push(now);
        this.guildCreateEvents.set(guildId, recent);
        return { allowed: true, code: 'OK' };
    }

    async enforceCreateCooldown(guildId, userId, createCooldownSeconds) {
        const key = makeCooldownKey('create', guildId, userId);

        if (isOnCooldown(key)) {
            const remainingSeconds = Math.ceil(getRemainingCooldownMs(key) / 1000);
            return { allowed: false, code: 'CREATE_COOLDOWN', retryAfterSeconds: remainingSeconds, message: `Create cooldown active. Wait ${remainingSeconds}s.` };
        }

        const state = await getState(guildId, userId);
        if (!state?.lastCreateAt) return { allowed: true, code: 'OK' };

        const elapsedMs = Date.now() - state.lastCreateAt.getTime();
        const cooldownMs = createCooldownSeconds * 1000;
        if (elapsedMs >= cooldownMs) return { allowed: true, code: 'OK' };

        const remainingMs = cooldownMs - elapsedMs;
        setCooldown(key, remainingMs);

        return {
            allowed: false,
            code: 'CREATE_COOLDOWN',
            retryAfterSeconds: Math.ceil(remainingMs / 1000),
            message: `Create cooldown active. Wait ${Math.ceil(remainingMs / 1000)}s.`,
        };
    }

    async enforceMaxRoomsPerUser(guildId, userId, maxRoomsPerUser) {
        const activeCount = await countActiveByOwner(guildId, userId);
        if (activeCount >= maxRoomsPerUser) {
            return { allowed: false, code: 'MAX_ROOMS', message: `You already have ${activeCount}/${maxRoomsPerUser} active room(s).` };
        }
        return { allowed: true, code: 'OK' };
    }

    async getState(guildId, userId) {
        return getState(guildId, userId);
    }

    async recordCreateSuccess(guildId, userId, createCooldownSeconds, channelId) {
        const now = new Date();
        await recordCreateAttempt(guildId, userId, now, channelId);
        await incrementActiveRooms(guildId, userId);

        const key = makeCooldownKey('create', guildId, userId);
        clearCooldown(key);
        if (createCooldownSeconds > 0) setCooldown(key, createCooldownSeconds * 1000);
    }

    async recordRoomDeleted(guildId, userId) {
        await decrementActiveRooms(guildId, userId);
    }
}
