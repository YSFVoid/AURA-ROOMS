import { Schema, model } from 'mongoose';
import { SafeLimits } from '../../config/safeLimits.js';

const tempRoomSchema = new Schema(
    {
        channelId: { type: String, required: true, unique: true },
        guildId: { type: String, required: true, index: true },
        ownerId: { type: String, required: true, index: true },
        createdAt: { type: Date, required: true, default: Date.now },
        lastActiveAt: { type: Date, required: true, default: Date.now },
        privacyMode: {
            type: String,
            enum: ['public', 'locked', 'private'],
            required: true,
            default: 'locked',
        },
        previousPrivacyMode: {
            type: String,
            enum: ['public', 'locked', 'private'],
        },
        userLimit: {
            type: Number,
            required: true,
            default: 0,
            min: SafeLimits.MIN_USER_LIMIT,
            max: SafeLimits.MAX_USER_LIMIT,
        },
        activityTag: { type: String, maxlength: SafeLimits.MAX_ACTIVITY_TAG_LEN },
        autoNameEnabled: { type: Boolean, required: true, default: true },
        locked: { type: Boolean, required: true, default: false },
        hidden: { type: Boolean, required: true, default: false },
        note: { type: String, maxlength: SafeLimits.MAX_ROOM_NOTE_LEN },
        panelMessageId: { type: String },
    },
    { timestamps: false, strict: true },
);

export const TempRoom = model('TempRoom', tempRoomSchema);
