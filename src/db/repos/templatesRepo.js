import { Defaults } from '../../config/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { UserTemplate } from '../models/UserTemplate.js';

export async function countByUser(guildId, ownerId) {
    return UserTemplate.countDocuments({ guildId, ownerId });
}

export async function save(payload) {
    const existing = await UserTemplate.findOne({
        guildId: payload.guildId,
        ownerId: payload.ownerId,
        name: payload.name,
    });

    if (!existing) {
        const total = await countByUser(payload.guildId, payload.ownerId);
        if (total >= Defaults.MAX_TEMPLATES_PER_USER) {
            throw new ValidationError(`Template limit reached (${Defaults.MAX_TEMPLATES_PER_USER})`);
        }
    }

    return UserTemplate.findOneAndUpdate(
        { guildId: payload.guildId, ownerId: payload.ownerId, name: payload.name },
        { $set: payload },
        { upsert: true, new: true },
    );
}

export async function edit(guildId, ownerId, name, patch) {
    return UserTemplate.findOneAndUpdate({ guildId, ownerId, name }, { $set: patch }, { new: true });
}

export async function remove(guildId, ownerId, name) {
    const result = await UserTemplate.deleteOne({ guildId, ownerId, name });
    return result.deletedCount > 0;
}

export async function list(guildId, ownerId) {
    return UserTemplate.find({ guildId, ownerId }).sort({ updatedAt: -1 });
}

export async function getByName(guildId, ownerId, name) {
    return UserTemplate.findOne({ guildId, ownerId, name });
}
