import { Schema, model } from 'mongoose';

const roomCreateLockSchema = new Schema(
    {
        guildId: { type: String, required: true },
        userId: { type: String, required: true },
        lockUntil: { type: Date, required: true },
    },
    { timestamps: false, strict: true },
);

roomCreateLockSchema.index({ guildId: 1, userId: 1 }, { unique: true });
roomCreateLockSchema.index({ lockUntil: 1 }, { expireAfterSeconds: 0 });

export const RoomCreateLock = model('RoomCreateLock', roomCreateLockSchema);
