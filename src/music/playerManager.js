import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { logger } from '../utils/logger.js';
import { MusicPlayer } from './musicPlayer.js';

const sessions = new Map();

export function getPlayer(guildId) {
    return sessions.get(guildId) ?? null;
}

export function getOrCreatePlayer(guildId) {
    let player = sessions.get(guildId);
    if (!player) {
        player = new MusicPlayer(guildId);
        sessions.set(guildId, player);
        logger.info({ guildId, step: 'MUSIC_SESSION_CREATE' }, 'music session created');
    }
    return player;
}

export function destroyPlayer(guildId) {
    const player = sessions.get(guildId);
    if (player) {
        player.destroy();
        sessions.delete(guildId);
        logger.info({ guildId, step: 'MUSIC_SESSION_DESTROY' }, 'music session destroyed');
    }
}

export function joinChannel(member) {
    const channel = member.voice.channel;
    if (!channel) return null;

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
    });

    const player = getOrCreatePlayer(channel.guild.id);
    player.setConnection(connection);
    return player;
}

export function stopIfInChannel(guildId, channelId) {
    const player = sessions.get(guildId);
    if (!player) return;
    const status = player.getStatus();
    if (status.channelId === channelId) {
        logger.info({ guildId, channelId, step: 'MUSIC_STOP_ROOM_DELETE' }, 'stopped music on room delete');
        destroyPlayer(guildId);
    }
}

export function cleanupDisconnected(guildId) {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
        destroyPlayer(guildId);
    }
}

export function getAllSessions() {
    return sessions;
}
