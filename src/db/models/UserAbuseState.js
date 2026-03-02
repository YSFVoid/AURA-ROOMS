import { Schema, model } from 'mongoose';
import { SafeLimits } from '../../config/safeLimits.js';

const userAbuseStateSchema = new Schema(
    {
        guildId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        lastCreateAt: { type: Date },
        lastCreatedChannelId: { type: String },
        activeRoomCount: { type: Number, required: true, default: 0, min: 0 },
        joinLeaveEvents: {
            type: [Date],
            required: true,
            default: [],
            validate: {
                validator: (value) => value.length <= SafeLimits.JOIN_LEAVE_EVENTS_CAP,
                message: 'joinLeaveEvents exceeds allowed size',
            },
        },
    },
    { timestamps: true, strict: true },
);

userAbuseStateSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const UserAbuseState = model('UserAbuseState', userAbuseStateSchema);
