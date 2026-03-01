import { SafeLimits } from '../../config/safeLimits.js';
import { UserAbuseState } from '../models/UserAbuseState.js';

export async function getState(guildId, userId) {
    return UserAbuseState.findOne({ guildId, userId });
}

export async function recordCreateAttempt(guildId, userId, ts) {
    await UserAbuseState.findOneAndUpdate(
        { guildId, userId },
        { $set: { guildId, userId, lastCreateAt: ts } },
        { upsert: true },
    );
}

export async function incrementActiveRooms(guildId, userId) {
    await UserAbuseState.findOneAndUpdate(
        { guildId, userId },
        { $setOnInsert: { guildId, userId }, $inc: { activeRoomCount: 1 } },
        { upsert: true },
    );
}

export async function decrementActiveRooms(guildId, userId) {
    const state = await UserAbuseState.findOne({ guildId, userId });
    if (!state) return;
    const next = Math.max(0, state.activeRoomCount - 1);
    await UserAbuseState.updateOne({ guildId, userId }, { $set: { activeRoomCount: next } });
}

export async function recordJoinLeaveEvent(guildId, userId, now, windowMs) {
    const windowStart = new Date(now.getTime() - windowMs);

    await UserAbuseState.findOneAndUpdate(
        { guildId, userId },
        { $setOnInsert: { guildId, userId, activeRoomCount: 0 } },
        { upsert: true },
    );

    await UserAbuseState.updateOne(
        { guildId, userId },
        { $pull: { joinLeaveEvents: { $lt: windowStart } } },
    );

    const state = await UserAbuseState.findOneAndUpdate(
        { guildId, userId },
        {
            $push: {
                joinLeaveEvents: {
                    $each: [now],
                    $slice: -SafeLimits.JOIN_LEAVE_EVENTS_CAP,
                },
            },
        },
        { new: true },
    );

    if (!state) return 0;
    return state.joinLeaveEvents.filter((eventAt) => eventAt >= windowStart).length;
}
