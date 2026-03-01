import { Schema, model } from 'mongoose';

const jtcLobbySchema = new Schema(
    {
        guildId: { type: String, required: true, index: true },
        lobbyChannelId: { type: String, required: true },
    },
    { timestamps: true },
);

jtcLobbySchema.index({ guildId: 1, lobbyChannelId: 1 }, { unique: true });

export const JtcLobby = model('JtcLobby', jtcLobbySchema);
