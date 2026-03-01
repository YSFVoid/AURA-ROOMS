import { Schema, model } from 'mongoose';

const roomPermissionSchema = new Schema(
    {
        channelId: { type: String, required: true, index: true },
        type: { type: String, required: true, enum: ['user', 'role'] },
        targetId: { type: String, required: true },
        action: { type: String, required: true, enum: ['allow', 'deny'] },
    },
    { timestamps: true, strict: true },
);

roomPermissionSchema.index({ channelId: 1, type: 1, targetId: 1 }, { unique: true });

export const RoomPermission = model('RoomPermission', roomPermissionSchema);
