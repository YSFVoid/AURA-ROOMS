import { SlashCommandBuilder } from 'discord.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../../ui/embeds.js';
import { PurpleOS } from '../../ui/theme.js';
import { Track } from '../../music/track.js';
import { validateTrackUrl, validateQueueSize, clampVolume } from '../../music/validators.js';
import { getPlayer, joinChannel, destroyPlayer } from '../../music/playerManager.js';

function requireVoice(interaction) {
    if (!interaction.member?.voice?.channelId) {
        return 'You must be in a voice channel.';
    }
    return null;
}

function requirePlayer(guildId) {
    const player = getPlayer(guildId);
    if (!player) return 'No music session active.';
    return null;
}

export const musicCommand = {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music controls')
        .addSubcommand((sub) =>
            sub.setName('play').setDescription('Play an audio URL')
                .addStringOption((o) => o.setName('url').setDescription('Direct audio URL (mp3, ogg, webm, etc.)').setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName('pause').setDescription('Pause playback'))
        .addSubcommand((sub) => sub.setName('resume').setDescription('Resume playback'))
        .addSubcommand((sub) => sub.setName('skip').setDescription('Skip current track'))
        .addSubcommand((sub) => sub.setName('stop').setDescription('Stop and clear queue'))
        .addSubcommand((sub) => sub.setName('queue').setDescription('Show the queue'))
        .addSubcommand((sub) =>
            sub.setName('loop').setDescription('Set loop mode')
                .addStringOption((o) => o.setName('mode').setDescription('Loop mode').setRequired(true)
                    .addChoices({ name: 'Off', value: 'off' }, { name: 'One', value: 'one' }, { name: 'All', value: 'all' })),
        )
        .addSubcommand((sub) =>
            sub.setName('volume').setDescription('Set volume')
                .addIntegerOption((o) => o.setName('level').setDescription('Volume (0-100)').setRequired(true).setMinValue(0).setMaxValue(100)),
        )
        .addSubcommand((sub) => sub.setName('leave').setDescription('Disconnect from voice')),

    async execute(interaction) {
        const settings = await ensureDefaults(interaction.guildId);
        if (!settings.musicEnabled) {
            await interaction.reply({ embeds: [createErrorEmbed('Music', 'Music is disabled on this server. Ask an admin to run `/setup music enable`.')], ephemeral: true });
            return;
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === 'play') await musicCommand.handlePlay(interaction, guildId);
        else if (sub === 'pause') await musicCommand.handlePause(interaction, guildId);
        else if (sub === 'resume') await musicCommand.handleResume(interaction, guildId);
        else if (sub === 'skip') await musicCommand.handleSkip(interaction, guildId);
        else if (sub === 'stop') await musicCommand.handleStop(interaction, guildId);
        else if (sub === 'queue') await musicCommand.handleQueue(interaction, guildId);
        else if (sub === 'loop') await musicCommand.handleLoop(interaction, guildId);
        else if (sub === 'volume') await musicCommand.handleVolume(interaction, guildId);
        else if (sub === 'leave') await musicCommand.handleLeave(interaction, guildId);
    },

    async handlePlay(interaction, guildId) {
        const voiceErr = requireVoice(interaction);
        if (voiceErr) { await interaction.reply({ embeds: [createErrorEmbed('Music', voiceErr)], ephemeral: true }); return; }

        const url = interaction.options.getString('url', true).trim();
        const valid = validateTrackUrl(url);
        if (!valid.ok) { await interaction.reply({ embeds: [createErrorEmbed('Music', valid.reason)], ephemeral: true }); return; }

        let player = getPlayer(guildId);
        if (!player) {
            player = joinChannel(interaction.member);
            if (!player) { await interaction.reply({ embeds: [createErrorEmbed('Music', 'Could not join your channel.')], ephemeral: true }); return; }
        }

        const queueCheck = validateQueueSize(player.queueLength);
        if (!queueCheck.ok) { await interaction.reply({ embeds: [createErrorEmbed('Music', queueCheck.reason)], ephemeral: true }); return; }

        const filename = url.split('/').pop()?.split('?')[0] ?? 'track';
        const track = new Track({ title: filename, url, requestedBy: interaction.user.id, source: 'url' });
        player.addTrack(track);

        await interaction.reply({
            embeds: [createSuccessEmbed(`${PurpleOS.Icons.ACTIVITY} Added to Queue`, `**${track.title}** — Position ${player.queueLength}`)],
            ephemeral: true,
        });
    },

    async handlePause(interaction, guildId) {
        const err = requirePlayer(guildId) ?? requireVoice(interaction);
        if (err) { await interaction.reply({ embeds: [createErrorEmbed('Music', err)], ephemeral: true }); return; }
        const player = getPlayer(guildId);
        if (player.pause()) {
            await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Paused')], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [createErrorEmbed('Music', 'Nothing is playing.')], ephemeral: true });
        }
    },

    async handleResume(interaction, guildId) {
        const err = requirePlayer(guildId) ?? requireVoice(interaction);
        if (err) { await interaction.reply({ embeds: [createErrorEmbed('Music', err)], ephemeral: true }); return; }
        const player = getPlayer(guildId);
        if (player.resume()) {
            await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Resumed')], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [createErrorEmbed('Music', 'Not paused.')], ephemeral: true });
        }
    },

    async handleSkip(interaction, guildId) {
        const err = requirePlayer(guildId) ?? requireVoice(interaction);
        if (err) { await interaction.reply({ embeds: [createErrorEmbed('Music', err)], ephemeral: true }); return; }
        const player = getPlayer(guildId);
        if (player.skip()) {
            await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Skipped')], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [createErrorEmbed('Music', 'Nothing to skip.')], ephemeral: true });
        }
    },

    async handleStop(interaction, guildId) {
        const err = requirePlayer(guildId) ?? requireVoice(interaction);
        if (err) { await interaction.reply({ embeds: [createErrorEmbed('Music', err)], ephemeral: true }); return; }
        const player = getPlayer(guildId);
        player.stop();
        await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Stopped and queue cleared.')], ephemeral: true });
    },

    async handleQueue(interaction, guildId) {
        const player = getPlayer(guildId);
        if (!player) {
            await interaction.reply({ embeds: [createInfoEmbed('Queue', 'No music session.')], ephemeral: true });
            return;
        }
        const status = player.getStatus();
        const lines = [];
        if (status.current) lines.push(`**Now Playing:** ${status.current.toEmbed()}`);
        else lines.push('**Now Playing:** Nothing');
        lines.push('');
        if (status.queue.length > 0) {
            status.queue.forEach((t, i) => lines.push(`**${i + 1}.** ${t.title}`));
            if (status.queueLength > 10) lines.push(`... and ${status.queueLength - 10} more`);
        } else {
            lines.push('Queue is empty.');
        }
        lines.push('', `Loop: **${status.loopMode}** ${PurpleOS.Icons.DOT} Volume: **${status.volume}%**`);
        await interaction.reply({ embeds: [createInfoEmbed('\ud83c\udfb5 Queue', lines.join('\n'))], ephemeral: true });
    },

    async handleLoop(interaction, guildId) {
        const err = requirePlayer(guildId) ?? requireVoice(interaction);
        if (err) { await interaction.reply({ embeds: [createErrorEmbed('Music', err)], ephemeral: true }); return; }
        const mode = interaction.options.getString('mode', true);
        const player = getPlayer(guildId);
        player.setLoopMode(mode);
        const label = mode === 'off' ? 'Off' : mode === 'one' ? 'One' : 'All';
        await interaction.reply({ embeds: [createSuccessEmbed('Music', `Loop: **${label}**`)], ephemeral: true });
    },

    async handleVolume(interaction, guildId) {
        const err = requirePlayer(guildId) ?? requireVoice(interaction);
        if (err) { await interaction.reply({ embeds: [createErrorEmbed('Music', err)], ephemeral: true }); return; }
        const level = clampVolume(interaction.options.getInteger('level', true));
        const player = getPlayer(guildId);
        player.setVolume(level);
        await interaction.reply({ embeds: [createSuccessEmbed('Music', `Volume: **${level}%**`)], ephemeral: true });
    },

    async handleLeave(interaction, guildId) {
        const err = requirePlayer(guildId) ?? requireVoice(interaction);
        if (err) { await interaction.reply({ embeds: [createErrorEmbed('Music', err)], ephemeral: true }); return; }
        destroyPlayer(guildId);
        await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Disconnected.')], ephemeral: true });
    },
};
