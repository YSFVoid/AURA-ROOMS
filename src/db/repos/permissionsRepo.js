import { RoomPermission } from '../models/RoomPermission.js';

export async function listByChannel(channelId) {
    return RoomPermission.find({ channelId }).sort({ type: 1, targetId: 1 });
}

export async function setPermission(channelId, type, targetId, action) {
    return RoomPermission.findOneAndUpdate(
        { channelId, type, targetId },
        { $set: { channelId, type, targetId, action } },
        { upsert: true, new: true },
    );
}

export async function removePermission(channelId, type, targetId) {
    const result = await RoomPermission.deleteOne({ channelId, type, targetId });
    return result.deletedCount > 0;
}

export async function clearByChannel(channelId) {
    await RoomPermission.deleteMany({ channelId });
}
