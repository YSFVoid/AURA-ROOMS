import { Defaults, type PrivacyMode } from '../../config/constants.js';
import { ValidationError } from '../../utils/errors.js';
import { UserTemplate, type IUserTemplate } from '../models/UserTemplate.js';

export interface TemplatePayload {
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

export async function countByUser(guildId: string, ownerId: string): Promise<number> {
  return UserTemplate.countDocuments({ guildId, ownerId });
}

export async function save(payload: TemplatePayload): Promise<IUserTemplate> {
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

  const result = await UserTemplate.findOneAndUpdate(
    { guildId: payload.guildId, ownerId: payload.ownerId, name: payload.name },
    { $set: payload },
    { upsert: true, new: true },
  );

  return result as IUserTemplate;
}

export async function edit(
  guildId: string,
  ownerId: string,
  name: string,
  patch: Partial<Omit<TemplatePayload, 'guildId' | 'ownerId' | 'name'>>,
): Promise<IUserTemplate | null> {
  return UserTemplate.findOneAndUpdate({ guildId, ownerId, name }, { $set: patch }, { new: true });
}

export async function remove(guildId: string, ownerId: string, name: string): Promise<boolean> {
  const result = await UserTemplate.deleteOne({ guildId, ownerId, name });
  return result.deletedCount > 0;
}

export async function list(guildId: string, ownerId: string): Promise<IUserTemplate[]> {
  return UserTemplate.find({ guildId, ownerId }).sort({ updatedAt: -1 });
}

export async function getByName(
  guildId: string,
  ownerId: string,
  name: string,
): Promise<IUserTemplate | null> {
  return UserTemplate.findOne({ guildId, ownerId, name });
}