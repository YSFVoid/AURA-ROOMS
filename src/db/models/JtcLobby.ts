import { Schema, model, type Document } from 'mongoose';

export interface IJtcLobby extends Document {
  guildId: string;
  lobbyChannelId: string;
}

const jtcLobbySchema = new Schema<IJtcLobby>(
  {
    guildId: { type: String, required: true, index: true },
    lobbyChannelId: { type: String, required: true },
  },
  { timestamps: true },
);

jtcLobbySchema.index({ guildId: 1, lobbyChannelId: 1 }, { unique: true });

export const JtcLobby = model<IJtcLobby>('JtcLobby', jtcLobbySchema);
