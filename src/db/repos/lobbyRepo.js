import { JtcLobby } from '../models/JtcLobby.js';

export async function list(guildId) {
    return JtcLobby.find({ guildId }).sort({ createdAt: -1 });
}

export async function add(guildId, lobbyChannelId) {
    return JtcLobby.findOneAndUpdate(
        { guildId, lobbyChannelId },
        { $set: { guildId, lobbyChannelId } },
        { upsert: true, new: true },
    );
}

export async function remove(guildId, lobbyChannelId) {
    const result = await JtcLobby.deleteOne({ guildId, lobbyChannelId });
    return result.deletedCount > 0;
}

export async function isLobby(guildId, channelId) {
    const row = await JtcLobby.findOne({ guildId, lobbyChannelId: channelId });
    return row !== null;
}

export async function replaceExact(guildId, lobbyChannelIds) {
    const uniqueIds = [...new Set(lobbyChannelIds)];
    await JtcLobby.deleteMany({ guildId, lobbyChannelId: { $nin: uniqueIds } });
    if (uniqueIds.length === 0) return;
    await Promise.all(uniqueIds.map(async (lobbyChannelId) => add(guildId, lobbyChannelId)));
}

export async function all() {
    return JtcLobby.find();
}
