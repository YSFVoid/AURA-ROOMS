import { GuildPreset } from '../models/GuildPreset.js';

export async function createPreset(guildId, name, data) {
    return GuildPreset.create({ guildId, name, ...data });
}

export async function updatePreset(guildId, name, data) {
    return GuildPreset.findOneAndUpdate(
        { guildId, name },
        { $set: data },
        { new: true },
    );
}

export async function deletePreset(guildId, name) {
    return GuildPreset.deleteOne({ guildId, name });
}

export async function listPresets(guildId) {
    return GuildPreset.find({ guildId }).sort({ name: 1 }).lean();
}

export async function getPreset(guildId, name) {
    return GuildPreset.findOne({ guildId, name }).lean();
}

export async function countPresets(guildId) {
    return GuildPreset.countDocuments({ guildId });
}
