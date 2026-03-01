import { Schema, model } from 'mongoose';
import { SafeLimits } from '../../config/safeLimits.js';

const userTemplateSchema = new Schema(
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
                validator: (value) => value.length <= SafeLimits.MAX_ALLOW_DENY_ENTRIES,
                message: 'allowedRoleIds exceeds allowed size',
            },
        },
        deniedRoleIds: {
            type: [String],
            required: true,
            default: [],
            validate: {
                validator: (value) => value.length <= SafeLimits.MAX_ALLOW_DENY_ENTRIES,
                message: 'deniedRoleIds exceeds allowed size',
            },
        },
    },
    { timestamps: true, strict: true },
);

userTemplateSchema.index({ guildId: 1, ownerId: 1, name: 1 }, { unique: true });

export const UserTemplate = model('UserTemplate', userTemplateSchema);
