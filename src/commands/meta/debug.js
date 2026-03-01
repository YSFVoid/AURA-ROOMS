import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { Branding } from '../../config/constants.js';
import { get as getGuildSettings } from '../../db/repos/guildSettingsRepo.js';
import { list as listLobbies } from '../../db/repos/lobbyRepo.js';
import { getTraceEvents } from '../../utils/voiceTracer.js';
import { PurpleOS } from '../../ui/theme.js';

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
                perms.has(PermissionFlagsBits.ManageChannels) ? '✅ ManageChannels' : '❌ ManageChannels',
                perms.has(PermissionFlagsBits.ViewChannel) ? '✅ ViewChannel' : '❌ ViewChannel',
                perms.has(PermissionFlagsBits.Connect) ? '✅ Connect' : '❌ Connect',
                perms.has(PermissionFlagsBits.MoveMembers) ? '✅ MoveMembers' : '❌ MoveMembers',
            ].join('\n');
        } else {
            categoryPerms = '⚠️ Category not in cache';
        }
    }

    let lobbyPerms = 'N/A';
    if (me && lobbyIds.length > 0) {
        const lobbyChannel = guild.channels.cache.get(lobbyIds[0]);
        if (lobbyChannel) {
            const perms = me.permissionsIn(lobbyChannel);
            lobbyPerms = [
                perms.has(PermissionFlagsBits.ViewChannel) ? '✅ ViewChannel' : '❌ ViewChannel',
                perms.has(PermissionFlagsBits.Connect) ? '✅ Connect' : '❌ Connect',
                perms.has(PermissionFlagsBits.MoveMembers) ? '✅ MoveMembers' : '❌ MoveMembers',
            ].join('\n');
        } else {
            lobbyPerms = '⚠️ Lobby channel not in cache';
        }
    }

    const eventLines = events.length > 0
        ? events.map((e) => `\`${e.ts.slice(11, 19)}\` **${e.action}** → ${e.result}${e.reason ? ` (${e.reason})` : ''}`).join('\n')
        : '`No events recorded yet.`';

    const embed = new EmbedBuilder()
        .setColor(PurpleOS.Colors.PRIMARY)
        .setTitle(`${PurpleOS.Icons.GEAR} AURA Debug • Voice`)
        .addFields(
            { name: 'Guild ID', value: `\`${guild.id}\``, inline: true },
            { name: 'Category ID', value: settings?.categoryId ? `\`${settings.categoryId}\`` : '`not set`', inline: true },
            { name: 'Log Channel', value: settings?.logChannelId ? `\`${settings.logChannelId}\`` : '`not set`', inline: true },
            { name: 'Interface Channel', value: settings?.interfaceChannelId ? `\`${settings.interfaceChannelId}\`` : '`not set`', inline: true },
            { name: 'Registered Lobbies', value: lobbyIds.length > 0 ? lobbyIds.map((id) => `\`${id}\``).join('\n') : '`none`', inline: false },
            { name: 'Your Voice Channel', value: currentVoiceChannel ? `\`${currentVoiceChannel}\` ${isInLobby ? '✅ IS a lobby' : '❌ NOT a lobby'}` : '`not in voice`', inline: false },
            { name: 'Bot → Category Perms', value: categoryPerms, inline: true },
            { name: 'Bot → Lobby Perms', value: lobbyPerms, inline: true },
            { name: `Last ${events.length} Voice Events`, value: eventLines, inline: false },
        )
        .setFooter({ text: Branding.FOOTER })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}
