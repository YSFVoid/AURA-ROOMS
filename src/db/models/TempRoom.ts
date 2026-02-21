import { Schema, model, type Document } from 'mongoose';
import type { PrivacyMode } from '../../config/constants.js';
import { SafeLimits } from '../../config/safeLimits.js';

export interface ITempRoom extends Document {
  channelId: string;
  guildId: string;
  ownerId: string;
  createdAt: Date;
  lastActiveAt: Date;
  privacyMode: PrivacyMode;
  userLimit: number;
  activityTag?: string;
  autoNameEnabled: boolean;
}

const tempRoomSchema = new Schema<ITempRoom>(
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
    userLimit: {
      type: Number,
      required: true,
      default: 0,
      min: SafeLimits.MIN_USER_LIMIT,
      max: SafeLimits.MAX_USER_LIMIT,
    },
    activityTag: { type: String, maxlength: SafeLimits.MAX_ACTIVITY_TAG_LEN },
    autoNameEnabled: { type: Boolean, required: true, default: true },
  },
  { timestamps: false, strict: true },
);

export const TempRoom = model<ITempRoom>('TempRoom', tempRoomSchema);