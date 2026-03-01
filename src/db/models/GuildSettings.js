import { Schema, model } from 'mongoose';
import { SafeLimits } from '../../config/safeLimits.js';

const guildSettingsSchema = new Schema(
    {
        guildId: { type: String, required: true },
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
        roomManagerRoleId: { type: String },
        logVerbosity: {
            type: String,
            enum: ['minimal', 'normal', 'verbose'],
            required: true,
            default: 'normal',
        },
        namingPolicy: {
            type: String,
            enum: ['normal', 'strict'],
            required: true,
            default: 'normal',
        },
        setupCompletedAt: { type: Date },
    },
    { timestamps: true, strict: true },
);

guildSettingsSchema.index({ guildId: 1 }, { unique: true });

export const GuildSettings = model('GuildSettings', guildSettingsSchema);
