import { Collection } from 'discord.js';
import { Branding } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { createInfoEmbed, createErrorEmbed } from '../../ui/embeds.js';
import { PurpleOS } from '../../ui/theme.js';
import { renderAuraInterface } from '../../ui/auraInterface.js';
import { canClaimRoom } from '../../utils/permissions.js';
import { getVersion } from '../../utils/version.js';

const aboutHandler = {
    name: 'about',
    description: 'Show bot info',
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
    async execute(message) {
        const prefix = env.PREFIX?.trim() || '!';
        const lines = [
            `**${prefix}about** Show bot info`,
            `**${prefix}help** This message`,
            `**${prefix}panel** Open your room control panel`,
            '',
            `*Slash commands are also available: /about, /room panel, /setup, /export, /import, /template*`,
        ];
        const embed = createInfoEmbed(`${PurpleOS.Icons.INFO} Commands`, lines.join('\n'));
        await message.reply({ embeds: [embed] });
    },
};

const panelHandler = {
    name: 'panel',
    description: 'Open room control panel',
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
        const canClaim = canClaimRoom(member, channel, room.ownerId);
        const rendered = renderAuraInterface({
            room,
            channel,
            templates,
            canClaim,
            state: { view: 'main', selectedTemplate: null },
        });

        await message.reply({ embeds: [rendered.embed], components: rendered.components });
    },
};

export function getPrefixCommands() {
    const commands = new Collection();
    commands.set(aboutHandler.name, aboutHandler);
    commands.set(helpHandler.name, helpHandler);
    commands.set(panelHandler.name, panelHandler);
    return commands;
}
