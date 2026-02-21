import { SafeLimits } from '../../config/safeLimits.js';
import { UserAbuseState, type IUserAbuseState } from '../models/UserAbuseState.js';

export async function getState(guildId: string, userId: string): Promise<IUserAbuseState | null> {
  return UserAbuseState.findOne({ guildId, userId });
}

export async function recordCreateAttempt(guildId: string, userId: string, ts: Date): Promise<void> {
  await UserAbuseState.findOneAndUpdate(
    { guildId, userId },
    { $set: { guildId, userId, lastCreateAt: ts } },
    { upsert: true },
  );
}

export async function incrementActiveRooms(guildId: string, userId: string): Promise<void> {
  await UserAbuseState.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId }, $inc: { activeRoomCount: 1 } },
    { upsert: true },
  );
}

export async function decrementActiveRooms(guildId: string, userId: string): Promise<void> {
  const state = await UserAbuseState.findOne({ guildId, userId });
  if (!state) {
    return;
  }

  const next = Math.max(0, state.activeRoomCount - 1);
  await UserAbuseState.updateOne({ guildId, userId }, { $set: { activeRoomCount: next } });
}

export async function recordJoinLeaveEvent(
  guildId: string,
  userId: string,
  now: Date,
  windowMs: number,
): Promise<number> {
  const windowStart = new Date(now.getTime() - windowMs);

  const state = await UserAbuseState.findOneAndUpdate(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId, activeRoomCount: 0 },
      $push: {
        joinLeaveEvents: {
          $each: [now],
          $slice: -SafeLimits.JOIN_LEAVE_EVENTS_CAP,
        },
      },
      $pull: { joinLeaveEvents: { $lt: windowStart } as unknown as Date },
    },
    { upsert: true, new: true },
  );

  if (!state) {
    return 0;
  }

  return state.joinLeaveEvents.filter((eventAt) => eventAt >= windowStart).length;
}
