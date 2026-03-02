import { RoomCreateLock } from '../models/RoomCreateLock.js';

export async function acquireLock(guildId, userId, ttlMs = 12000) {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + ttlMs);

    try {
        await RoomCreateLock.findOneAndUpdate(
            { guildId, userId, lockUntil: { $lt: now } },
            { $set: { lockUntil } },
            { upsert: true },
        );
        return true;
    } catch (error) {
        if (error?.code === 11000) return false;
        throw error;
    }
}

export async function releaseLock(guildId, userId) {
    await RoomCreateLock.deleteOne({ guildId, userId }).catch(() => null);
}
