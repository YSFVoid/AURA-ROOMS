import { withRetries } from '../../utils/retry.js';
import { TempRoom } from '../models/TempRoom.js';

export async function create(data) {
    return withRetries(async () =>
        TempRoom.create({ ...data, createdAt: new Date(), lastActiveAt: new Date() }),
    );
}

export async function getByChannel(channelId) {
    return TempRoom.findOne({ channelId });
}

export async function listByGuild(guildId) {
    return TempRoom.find({ guildId });
}

export async function listByOwner(guildId, ownerId) {
    return TempRoom.find({ guildId, ownerId }).sort({ createdAt: -1, _id: -1 });
}

export async function findByOwner(guildId, ownerId) {
    return listByOwner(guildId, ownerId);
}

export async function getNewestByOwner(guildId, ownerId) {
    return TempRoom.findOne({ guildId, ownerId }).sort({ createdAt: -1, _id: -1 });
}

export async function listAll() {
    return TempRoom.find();
}

export async function countActiveByOwner(guildId, ownerId) {
    return TempRoom.countDocuments({ guildId, ownerId });
}

export async function transferOwner(channelId, newOwnerId) {
    return withRetries(async () =>
        TempRoom.findOneAndUpdate(
            { channelId },
            { $set: { ownerId: newOwnerId, lastActiveAt: new Date() } },
            { new: true },
        ),
    );
}

export async function updateRoomSettings(channelId, patch) {
    return withRetries(async () =>
        TempRoom.findOneAndUpdate({ channelId }, { $set: patch }, { new: true }),
    );
}

export async function deleteRoom(channelId) {
    const result = await withRetries(async () => TempRoom.deleteOne({ channelId }));
    return result.deletedCount > 0;
}
