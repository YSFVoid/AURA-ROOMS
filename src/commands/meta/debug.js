import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { Branding } from '../../config/constants.js';
import { get as getGuildSettings } from '../../db/repos/guildSettingsRepo.js';
import { list as listLobbies } from '../../db/repos/lobbyRepo.js';
import { getTraceEvents } from '../../utils/voiceTracer.js';
import { PurpleOS } from '../../ui/theme.js';
import { humanizeEventKey, humanizeKey } from '../../utils/humanize.js';

export const debugCommand = {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug diagnostics (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) => sub.setName('voice').setDescription('Show voice flow diagnostics')),

    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({ content: 'Server only.', ephemeral: true });
            return;
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'voice') {
            await handleDebugVoice(interaction);
        }
    },
};

async function handleDebugVoice(interaction) {
    const guild = interaction.guild;
    const member = interaction.member;
    const settings = await getGuildSettings(guild.id);
    const lobbies = await listLobbies(guild.id);
    const lobbyIds = lobbies.map((l) => l.lobbyChannelId);
    const events = getTraceEvents(guild.id, 15);

    const me = guild.members.me;
    const currentVoiceChannel = member.voice?.channelId ?? null;
    const isInLobby = currentVoiceChannel ? lobbyIds.includes(currentVoiceChannel) : false;

    let categoryPerms = 'N/A';
    if (me && settings?.categoryId) {
        const cat = guild.channels.cache.get(settings.categoryId);
        if (cat) {
            const perms = me.permissionsIn(cat);
            categoryPerms = [
                perms.has(PermissionFlagsBits.ManageChannels) ? '\u2705 Manage Channels' : '\u274c Manage Channels',
                perms.has(PermissionFlagsBits.ViewChannel) ? '\u2705 View Channel' : '\u274c View Channel',
                perms.has(PermissionFlagsBits.Connect) ? '\u2705 Connect' : '\u274c Connect',
                perms.has(PermissionFlagsBits.MoveMembers) ? '\u2705 Move Members' : '\u274c Move Members',
            ].join('\n');
        } else {
            categoryPerms = '\u26a0\ufe0f Category not in cache';
        }
    }

    let lobbyPerms = 'N/A';
    if (me && lobbyIds.length > 0) {
        const lobbyChannel = guild.channels.cache.get(lobbyIds[0]);
        if (lobbyChannel) {
            const perms = me.permissionsIn(lobbyChannel);
            lobbyPerms = [
                perms.has(PermissionFlagsBits.ViewChannel) ? '\u2705 View Channel' : '\u274c View Channel',
                perms.has(PermissionFlagsBits.Connect) ? '\u2705 Connect' : '\u274c Connect',
                perms.has(PermissionFlagsBits.MoveMembers) ? '\u2705 Move Members' : '\u274c Move Members',
            ].join('\n');
        } else {
            lobbyPerms = '\u26a0\ufe0f Lobby channel not in cache';
        }
    }

    const eventLines = events.length > 0
        ? events
            .map((e) => {
                const action = humanizeEventKey(e.action);
                const result = humanizeKey(e.result);
                const reason = e.reason ? ` (${humanizeEventKey(e.reason)})` : '';
                return `\`${e.ts.slice(11, 19)}\` **${action}** \u2192 ${result}${reason}`;
            })
            .join('\n')
        : '`No events recorded yet.`';

    const embed = new EmbedBuilder()
        .setColor(PurpleOS.Colors.PURPLEOS_PRIMARY)
        .setTitle(`${PurpleOS.Icons.GEAR} AURA Debug Voice`)
        .addFields(
            { name: 'Guild ID', value: `\`${guild.id}\``, inline: true },
            { name: 'Category ID', value: settings?.categoryId ? `\`${settings.categoryId}\`` : '`Not set`', inline: true },
            { name: 'Log Channel', value: settings?.logChannelId ? `\`${settings.logChannelId}\`` : '`Not set`', inline: true },
            { name: 'Interface Channel', value: settings?.interfaceChannelId ? `\`${settings.interfaceChannelId}\`` : '`Not set`', inline: true },
            { name: 'Registered Lobbies', value: lobbyIds.length > 0 ? lobbyIds.map((id) => `\`${id}\``).join('\n') : '`None`', inline: false },
            {
                name: 'Your Voice Channel',
                value: currentVoiceChannel
                    ? `\`${currentVoiceChannel}\` ${isInLobby ? '\u2705 Is a lobby' : '\u274c Not a lobby'}`
                    : '`Not in voice`',
                inline: false,
            },
            { name: 'Bot to Category Perms', value: categoryPerms, inline: true },
            { name: 'Bot to Lobby Perms', value: lobbyPerms, inline: true },
            { name: `Last ${events.length} Voice Events`, value: eventLines, inline: false },
        )
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}
