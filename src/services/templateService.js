import { Defaults } from '../config/constants.js';
import { SafeLimits } from '../config/safeLimits.js';
import { edit, getByName, list, remove, save } from '../db/repos/templatesRepo.js';
import { clearByChannel, setPermission } from '../db/repos/permissionsRepo.js';
import { updateRoomSettings } from '../db/repos/roomsRepo.js';
import { interpolateTemplate } from '../utils/format.js';
import { ValidationError } from '../utils/errors.js';

export class TemplateService {
    constructor(permissionService) {
        this.permissionService = permissionService;
    }

    validateTemplateName(name) {
        const normalized = name.trim();
        if (normalized.length < 1 || normalized.length > SafeLimits.MAX_TEMPLATE_NAME_LEN) {
            throw new ValidationError(`Template name must be between 1 and ${SafeLimits.MAX_TEMPLATE_NAME_LEN} characters.`);
        }
    }

    async saveTemplate(payload) {
        this.validateTemplateName(payload.name);
        if (payload.userLimit < 0 || payload.userLimit > 99) throw new ValidationError('User limit must be between 0 and 99.');
        if (payload.nameTemplate.length > SafeLimits.MAX_NAME_TEMPLATE_LEN) {
            throw new ValidationError(`Name template must be ${SafeLimits.MAX_NAME_TEMPLATE_LEN} characters or fewer.`);
        }
        await save(payload);
    }

    async editTemplate(guildId, ownerId, name, patch) {
        if (patch.nameTemplate && patch.nameTemplate.length > SafeLimits.MAX_NAME_TEMPLATE_LEN) {
            throw new ValidationError(`Name template must be ${SafeLimits.MAX_NAME_TEMPLATE_LEN} characters or fewer.`);
        }
        if (typeof patch.userLimit === 'number' && (patch.userLimit < SafeLimits.MIN_USER_LIMIT || patch.userLimit > SafeLimits.MAX_USER_LIMIT)) {
            throw new ValidationError(`User limit must be between ${SafeLimits.MIN_USER_LIMIT} and ${SafeLimits.MAX_USER_LIMIT}.`);
        }
        if (patch.activityTag && patch.activityTag.length > SafeLimits.MAX_ACTIVITY_TAG_LEN) {
            throw new ValidationError(`Activity tag must be ${SafeLimits.MAX_ACTIVITY_TAG_LEN} characters or fewer.`);
        }
        const updated = await edit(guildId, ownerId, name, patch);
        return updated !== null;
    }

    async deleteTemplate(guildId, ownerId, name) {
        return remove(guildId, ownerId, name);
    }

    async listTemplates(guildId, ownerId) {
        const templates = await list(guildId, ownerId);
        return templates.slice(0, Defaults.MAX_TEMPLATES_PER_USER);
    }

    async getTemplate(guildId, ownerId, name) {
        return getByName(guildId, ownerId, name);
    }

    async applyTemplateToRoom(params) {
        const template = await getByName(params.guildId, params.ownerId, params.templateName);
        if (!template) throw new ValidationError('Template not found.');

        const nextName = interpolateTemplate(template.nameTemplate, params.member);
        await this.permissionService.rename(params.channel, nextName, params.namingPolicy);
        await this.permissionService.setUserLimit(params.channel, template.userLimit);

        await clearByChannel(params.channel.id);
        for (const roleId of template.allowedRoleIds) {
            await setPermission(params.channel.id, 'role', roleId, 'allow');
        }
        for (const roleId of template.deniedRoleIds) {
            await setPermission(params.channel.id, 'role', roleId, 'deny');
        }

        await this.permissionService.applyPrivacy(
            params.channel, template.privacyMode, params.room.ownerId, params.trustedRoleIds,
            { locked: params.room.locked, hidden: params.room.hidden },
        );

        await updateRoomSettings(params.channel.id, {
            privacyMode: template.privacyMode,
            userLimit: template.userLimit,
            activityTag: template.activityTag,
            autoNameEnabled: template.autoNameEnabled,
            lastActiveAt: new Date(),
        });
    }
}
