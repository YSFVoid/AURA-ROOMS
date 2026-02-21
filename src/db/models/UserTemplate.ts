import { Schema, model, type Document } from 'mongoose';
import type { PrivacyMode } from '../../config/constants.js';
import { SafeLimits } from '../../config/safeLimits.js';

export interface IUserTemplate extends Document {
  guildId: string;
  ownerId: string;
  name: string;
  nameTemplate: string;
  privacyMode: PrivacyMode;
  userLimit: number;
  activityTag?: string;
  autoNameEnabled: boolean;
  allowedRoleIds: string[];
  deniedRoleIds: string[];
}

const userTemplateSchema = new Schema<IUserTemplate>(
  {
    guildId: { type: String, required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    name: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: SafeLimits.MAX_TEMPLATE_NAME_LEN,
    },
    nameTemplate: {
      type: String,
      required: true,
      maxlength: SafeLimits.MAX_NAME_TEMPLATE_LEN,
    },
    privacyMode: {
      type: String,
      required: true,
      enum: ['public', 'locked', 'private'],
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
    allowedRoleIds: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator: (value: string[]) => value.length <= SafeLimits.MAX_ALLOW_DENY_ENTRIES,
        message: 'allowedRoleIds exceeds allowed size',
      },
    },
    deniedRoleIds: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator: (value: string[]) => value.length <= SafeLimits.MAX_ALLOW_DENY_ENTRIES,
        message: 'deniedRoleIds exceeds allowed size',
      },
    },
  },
  { timestamps: true, strict: true },
);

userTemplateSchema.index({ guildId: 1, ownerId: 1, name: 1 }, { unique: true });

export const UserTemplate = model<IUserTemplate>('UserTemplate', userTemplateSchema);