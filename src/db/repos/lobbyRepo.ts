import { JtcLobby, type IJtcLobby } from '../models/JtcLobby.js';

export async function list(guildId: string): Promise<IJtcLobby[]> {
  return JtcLobby.find({ guildId }).sort({ createdAt: -1 });
}

export async function add(guildId: string, lobbyChannelId: string): Promise<IJtcLobby> {
  const result = await JtcLobby.findOneAndUpdate(
    { guildId, lobbyChannelId },
    { $set: { guildId, lobbyChannelId } },
    { upsert: true, new: true },
  );

  return result as IJtcLobby;
}

export async function remove(guildId: string, lobbyChannelId: string): Promise<boolean> {
  const result = await JtcLobby.deleteOne({ guildId, lobbyChannelId });
  return result.deletedCount > 0;
}

export async function isLobby(guildId: string, channelId: string): Promise<boolean> {
  const row = await JtcLobby.findOne({ guildId, lobbyChannelId: channelId });
  return row !== null;
}

export async function replaceExact(guildId: string, lobbyChannelIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(lobbyChannelIds)];
  await JtcLobby.deleteMany({ guildId, lobbyChannelId: { $nin: uniqueIds } });

  if (uniqueIds.length === 0) {
    return;
  }

  await Promise.all(uniqueIds.map(async (lobbyChannelId) => add(guildId, lobbyChannelId)));
}

export async function all(): Promise<IJtcLobby[]> {
  return JtcLobby.find();
}
