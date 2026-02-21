import type { PrivacyMode } from '../../config/constants.js';
import { withRetries } from '../../utils/retry.js';
import { TempRoom, type ITempRoom } from '../models/TempRoom.js';

export async function create(data: {
  channelId: string;
  guildId: string;
  ownerId: string;
  privacyMode: PrivacyMode;
  userLimit: number;
  activityTag?: string;
  autoNameEnabled: boolean;
}): Promise<ITempRoom> {
  return withRetries(async () =>
    TempRoom.create({
      ...data,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    }),
  );
}

export async function getByChannel(channelId: string): Promise<ITempRoom | null> {
  return TempRoom.findOne({ channelId });
}

export async function listByGuild(guildId: string): Promise<ITempRoom[]> {
  return TempRoom.find({ guildId });
}

export async function listAll(): Promise<ITempRoom[]> {
  return TempRoom.find();
}

export async function countActiveByOwner(guildId: string, ownerId: string): Promise<number> {
  return TempRoom.countDocuments({ guildId, ownerId });
}

export async function transferOwner(channelId: string, newOwnerId: string): Promise<ITempRoom | null> {
  return withRetries(async () =>
    TempRoom.findOneAndUpdate(
      { channelId },
      { $set: { ownerId: newOwnerId, lastActiveAt: new Date() } },
      { new: true },
    ),
  );
}

export async function updateRoomSettings(
  channelId: string,
  patch: Partial<{
    ownerId: string;
    privacyMode: PrivacyMode;
    userLimit: number;
    activityTag: string;
    autoNameEnabled: boolean;
    lastActiveAt: Date;
  }>,
): Promise<ITempRoom | null> {
  return withRetries(async () =>
    TempRoom.findOneAndUpdate({ channelId }, { $set: patch }, { new: true }),
  );
}

export async function deleteRoom(channelId: string): Promise<boolean> {
  const result = await withRetries(async () => TempRoom.deleteOne({ channelId }));
  return result.deletedCount > 0;
}
