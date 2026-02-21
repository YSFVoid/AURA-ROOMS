import {
  RoomPermission,
  type IRoomPermission,
  type RoomPermissionAction,
  type RoomPermissionType,
} from '../models/RoomPermission.js';

export async function listByChannel(channelId: string): Promise<IRoomPermission[]> {
  return RoomPermission.find({ channelId }).sort({ type: 1, targetId: 1 });
}

export async function setPermission(
  channelId: string,
  type: RoomPermissionType,
  targetId: string,
  action: RoomPermissionAction,
): Promise<IRoomPermission> {
  const result = await RoomPermission.findOneAndUpdate(
    { channelId, type, targetId },
    { $set: { channelId, type, targetId, action } },
    { upsert: true, new: true },
  );

  return result as IRoomPermission;
}

export async function removePermission(
  channelId: string,
  type: RoomPermissionType,
  targetId: string,
): Promise<boolean> {
  const result = await RoomPermission.deleteOne({ channelId, type, targetId });
  return result.deletedCount > 0;
}

export async function clearByChannel(channelId: string): Promise<void> {
  await RoomPermission.deleteMany({ channelId });
}
