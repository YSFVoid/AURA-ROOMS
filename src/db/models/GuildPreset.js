import { Schema, model } from 'mongoose';
import { SafeLimits } from '../../config/safeLimits.js';

const guildPresetSchema = new Schema(
    {
        guildId: { type: String, required: true },
        name: { type: String, required: true, maxlength: SafeLimits.MAX_ROOM_NAME_LEN },
        privacyMode: { type: String, enum: ['public', 'locked', 'private'], default: 'locked' },
        userLimit: { type: Number, default: 0, min: 0, max: SafeLimits.MAX_USER_LIMIT },
        activityTag: { type: String, maxlength: SafeLimits.MAX_ACTIVITY_TAG_LEN },
        autoNameEnabled: { type: Boolean, default: true },
        locked: { type: Boolean, default: false },
        hidden: { type: Boolean, default: false },
        createdBy: { type: String, required: true },
    },
    { timestamps: true, strict: true },
);

guildPresetSchema.index({ guildId: 1, name: 1 }, { unique: true });

export const GuildPreset = model('GuildPreset', guildPresetSchema);
