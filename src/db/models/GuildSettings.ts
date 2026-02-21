import { Schema, model, type Document } from 'mongoose';
import type { PrivacyMode } from '../../config/constants.js';
import { SafeLimits } from '../../config/safeLimits.js';

export interface IGuildSettings extends Document {
  guildId: string;
  categoryId?: string;
  logChannelId?: string;
  defaultTemplate: string;
  defaultPrivacy: PrivacyMode;
  defaultUserLimit: number;
  maxRoomsPerUser: number;
  createCooldownSeconds: number;
  emptyDeleteSeconds: number;
  trustedRoleIds: string[];
  djRoleId?: string;
  setupCompletedAt?: Date;
}

const guildSettingsSchema = new Schema<IGuildSettings>(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    categoryId: { type: String },
    logChannelId: { type: String },
    defaultTemplate: {
      type: String,
      required: true,
      default: "{displayName}'s room",
      maxlength: SafeLimits.MAX_NAME_TEMPLATE_LEN,
    },
    defaultPrivacy: {
      type: String,
      enum: ['public', 'locked', 'private'],
      required: true,
      default: 'locked',
    },
    defaultUserLimit: {
      type: Number,
      required: true,
      default: 0,
      min: SafeLimits.MIN_USER_LIMIT,
      max: SafeLimits.MAX_USER_LIMIT,
    },
    maxRoomsPerUser: {
      type: Number,
      required: true,
      default: 1,
      min: SafeLimits.MIN_ROOMS_PER_USER,
      max: SafeLimits.MAX_ROOMS_PER_USER,
    },
    createCooldownSeconds: {
      type: Number,
      required: true,
      default: 30,
      min: 0,
      max: SafeLimits.MAX_COOLDOWN_SECONDS,
    },
    emptyDeleteSeconds: {
      type: Number,
      required: true,
      default: 30,
      min: SafeLimits.MIN_EMPTY_DELETE_SECONDS,
      max: SafeLimits.MAX_EMPTY_DELETE_SECONDS,
    },
    trustedRoleIds: { type: [String], required: true, default: [] },
    djRoleId: { type: String },
    setupCompletedAt: { type: Date },
  },
  { timestamps: true, strict: true },
);

export const GuildSettings = model<IGuildSettings>('GuildSettings', guildSettingsSchema);
