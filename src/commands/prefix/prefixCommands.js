import { Collection, PermissionFlagsBits } from 'discord.js';
import { Branding } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { createInfoEmbed, createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { PurpleOS } from '../../ui/theme.js';
import { renderAuraInterface } from '../../ui/auraInterface.js';
import { canClaimRoom } from '../../utils/permissions.js';
import { getVersion } from '../../utils/version.js';
import { updateRoomSettings } from '../../db/repos/roomsRepo.js';

function isAdmin(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

const aboutHandler = {
    name: 'about',
    description: 'Show bot info',
    adminOnly: false,
    async execute(message) {
        const version = getVersion();
        const embed = createInfoEmbed(
            `${PurpleOS.Icons.SPARKLE} ${Branding.NAME}`,
            [
                `**Version** ${version}`,
                `**Developer** ${Branding.DEVELOPER}`,
                `**Intents** Guilds, Voice States${env.PREFIX_ENABLED?.trim() === 'true' ? ', Messages' : ''}`,
                '',
                `*${Branding.ABOUT_FOOTER}*`,
            ].join('\n'),
        );
        await message.reply({ embeds: [embed] });
    },
};

const helpHandler = {
    name: 'help',
    description: 'List available commands',
    adminOnly: false,
    async execute(message) {
        const p = env.PREFIX?.trim() || '!';
        const lines = [
            `**${p}about** ${PurpleOS.Icons.DOT} Show bot info`,
            `**${p}help** ${PurpleOS.Icons.DOT} This message`,
            `**${p}panel** ${PurpleOS.Icons.DOT} Open room control panel`,
            `**${p}activity** \`<tag>\` ${PurpleOS.Icons.DOT} Set room activity`,
            `**${p}template list** ${PurpleOS.Icons.DOT} List your templates`,
            `**${p}template apply** \`<name>\` ${PurpleOS.Icons.DOT} Apply a template`,
            `**${p}template save** \`<name>\` ${PurpleOS.Icons.DOT} Save current room`,
            '',
            `*Admin only:*`,
            `**${p}setup** ${PurpleOS.Icons.DOT} Run setup wizard`,
            `**${p}export** ${PurpleOS.Icons.DOT} Export config`,
            '',
            `*Slash commands: /about, /room panel, /setup, /export, /import, /template*`,
        ];
        const embed = createInfoEmbed(`${PurpleOS.Icons.INFO} Commands`, lines.join('\n'));
        await message.reply({ embeds: [embed] });
    },
};

const panelHandler = {
    name: 'panel',
    description: 'Open room control panel',
    adminOnly: false,
    async execute(message, _args, context) {
        const member = message.member;
        if (!member?.voice?.channelId) {
            await message.reply({ embeds: [createErrorEmbed('Panel', 'You must be in a voice channel.')] });
            return;
        }

        const channel = member.voice.channel;
        const room = await context.roomService.getTrackedRoom(channel.id);
        if (!room) {
            await message.reply({ embeds: [createErrorEmbed('Panel', 'This is not a tracked temp room.')] });
            return;
        }

        const templates = await context.templateService.listTemplates(member.guild.id, member.id);
        const claimable = canClaimRoom(member, channel, room.ownerId);
        const rendered = renderAuraInterface({
            room,
            channel,
            templates,
            canClaim: claimable,
            state: { view: 'main', selectedTemplate: null },
        });

        await message.reply({ embeds: [rendered.embed], components: rendered.components });
    },
};

const activityHandler = {
    name: 'activity',
    description: 'Set room activity',
    adminOnly: false,
    async execute(message, args, context) {
        const member = message.member;
        if (!member?.voice?.channelId) {
            await message.reply({ embeds: [createErrorEmbed('Activity', 'You must be in a voice channel.')] });
            return;
        }

        const channel = member.voice.channel;
        const room = await context.roomService.getTrackedRoom(channel.id);
        if (!room) {
            await message.reply({ embeds: [createErrorEmbed('Activity', 'This is not a tracked temp room.')] });
            return;
        }

        const tag = args.join(' ').trim() || undefined;
        const validTags = ['gaming', 'study', 'chill', 'afk', 'none'];
        if (tag && !validTags.includes(tag.toLowerCase())) {
            await message.reply({ embeds: [createErrorEmbed('Activity', `Valid: ${validTags.join(', ')}`)] });
            return;
        }

        const activityTag = tag?.toLowerCase() === 'none' ? undefined : tag;
        await updateRoomSettings(room.channelId, { activityTag, lastActiveAt: new Date() });
        await message.reply({ embeds: [createSuccessEmbed('Activity', activityTag ?? 'Cleared')] });
    },
};

const templateHandler = {
    name: 'template',
    description: 'Template commands',
    adminOnly: false,
    async execute(message, args, context) {
        const member = message.member;
        const sub = args[0]?.toLowerCase();

        if (sub === 'list') {
            const templates = await context.templateService.listTemplates(member.guild.id, member.id);
            if (templates.length === 0) {
                await message.reply({ embeds: [createInfoEmbed('Templates', 'No templates saved.')] });
                return;
            }
            const lines = templates.map((t, i) => `**${i + 1}.** ${t.name}`);
            await message.reply({ embeds: [createInfoEmbed('Your Templates', lines.join('\n'))] });
            return;
        }

        if (sub === 'save') {
            if (!member?.voice?.channelId) {
                await message.reply({ embeds: [createErrorEmbed('Template', 'You must be in a voice channel.')] });
                return;
            }
            const name = args.slice(1).join(' ').trim();
            if (!name) {
                await message.reply({ embeds: [createErrorEmbed('Template', 'Provide a template name.')] });
                return;
            }

            const channel = member.voice.channel;
            const room = await context.roomService.getTrackedRoom(channel.id);
            if (!room) {
                await message.reply({ embeds: [createErrorEmbed('Template', 'Not a tracked temp room.')] });
                return;
            }

            await context.templateService.saveTemplate(member.guild.id, member.id, name, room);
            await message.reply({ embeds: [createSuccessEmbed('Template Saved', name)] });
            return;
        }

        if (sub === 'apply') {
            if (!member?.voice?.channelId) {
                await message.reply({ embeds: [createErrorEmbed('Template', 'You must be in a voice channel.')] });
                return;
            }
            const name = args.slice(1).join(' ').trim();
            if (!name) {
                await message.reply({ embeds: [createErrorEmbed('Template', 'Provide a template name.')] });
                return;
            }

            const channel = member.voice.channel;
            const room = await context.roomService.getTrackedRoom(channel.id);
            if (!room) {
                await message.reply({ embeds: [createErrorEmbed('Template', 'Not a tracked temp room.')] });
                return;
            }

            const { ensureDefaults } = await import('../../db/repos/guildSettingsRepo.js');
            const settings = await ensureDefaults(member.guild.id);
            const trustedRoleIds = settings.roomManagerRoleId
                ? [...settings.trustedRoleIds, settings.roomManagerRoleId]
                : settings.trustedRoleIds;

            await context.templateService.applyTemplateToRoom({
                templateName: name,
                guildId: member.guild.id,
                ownerId: member.id,
                member,
                channel,
                room,
                trustedRoleIds,
                namingPolicy: settings.namingPolicy,
            });

            await message.reply({ embeds: [createSuccessEmbed('Template Applied', name)] });
            return;
        }

        const p = env.PREFIX?.trim() || '!';
        await message.reply({ embeds: [createInfoEmbed('Template', `Usage: ${p}template list | save <name> | apply <name>`)] });
    },
};

const setupHandler = {
    name: 'setup',
    description: 'Run setup wizard',
    adminOnly: true,
    async execute(message, _args, context) {
        if (!isAdmin(message.member)) {
            await message.reply({ embeds: [createErrorEmbed('Setup', 'Admin only.')] });
            return;
        }

        await context.setupService.runSetup(message.member.guild, message.member);
        await message.reply({ embeds: [createSuccessEmbed('Setup', 'Setup wizard completed.')] });
    },
};

const exportHandler = {
    name: 'export',
    description: 'Export server config',
    adminOnly: true,
    async execute(message) {
        if (!isAdmin(message.member)) {
            await message.reply({ embeds: [createErrorEmbed('Export', 'Admin only.')] });
            return;
        }

        const { ensureDefaults } = await import('../../db/repos/guildSettingsRepo.js');
        const settings = await ensureDefaults(message.guild.id);
        const json = JSON.stringify(settings, null, 2);
        await message.reply({
            embeds: [createSuccessEmbed('Export', 'Configuration exported.')],
            files: [{ attachment: Buffer.from(json), name: 'aura-config.json' }],
        });
    },
};

export function getPrefixCommands() {
    const commands = new Collection();
    const handlers = [aboutHandler, helpHandler, panelHandler, activityHandler, templateHandler, setupHandler, exportHandler];
    for (const handler of handlers) {
        commands.set(handler.name, handler);
    }
    return commands;
}
