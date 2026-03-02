import {
    AudioPlayerStatus,
    AudioResource,
    createAudioPlayer,
    createAudioResource,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    entersState,
} from '@discordjs/voice';
import { logger } from '../utils/logger.js';
import { Track } from './track.js';
import { clampVolume } from './validators.js';

export const LoopMode = { OFF: 'off', ONE: 'one', ALL: 'all' };

export class MusicPlayer {
    constructor(guildId) {
        this.guildId = guildId;
        this.queue = [];
        this.current = null;
        this.loopMode = LoopMode.OFF;
        this.volume = 50;
        this.paused = false;
        this.connection = null;
        this.idleTimeout = null;
        this.idleSeconds = 60;
        this.actionLock = null;

        this.player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
        });

        this.player.on(AudioPlayerStatus.Idle, () => this.onTrackEnd());
        this.player.on('error', (error) => {
            logger.error({ guildId, err: error.message, step: 'MUSIC_PLAYER_ERROR' }, 'audio player error');
            this.onTrackEnd();
        });
    }

    get isPlaying() {
        return this.player.state.status === AudioPlayerStatus.Playing;
    }

    get isPaused() {
        return this.player.state.status === AudioPlayerStatus.Paused;
    }

    get isIdle() {
        return this.player.state.status === AudioPlayerStatus.Idle;
    }

    get nowPlaying() {
        return this.current;
    }

    get queueLength() {
        return this.queue.length;
    }

    setConnection(connection) {
        this.connection = connection;
        connection.subscribe(this.player);

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
            } catch {
                this.destroy();
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            this.cleanup();
        });
    }

    addTrack(track) {
        this.queue.push(track);
        this.clearIdleTimeout();
        if (this.isIdle && !this.current) {
            this.playNext();
        }
    }

    playNext() {
        this.clearIdleTimeout();

        if (this.queue.length === 0) {
            this.current = null;
            this.startIdleTimeout();
            return false;
        }

        const track = this.queue.shift();
        this.current = track;

        try {
            const resource = createAudioResource(track.url, {
                inlineVolume: true,
            });
            resource.volume?.setVolume(this.volume / 100);
            this.player.play(resource);
            logger.info({ guildId: this.guildId, trackId: track.id, title: track.title, step: 'MUSIC_PLAY' }, 'playing track');
            return true;
        } catch (error) {
            logger.error({ guildId: this.guildId, err: error.message, step: 'MUSIC_PLAY_ERROR' }, 'failed to play');
            this.current = null;
            return this.playNext();
        }
    }

    onTrackEnd() {
        if (!this.current) return;

        if (this.loopMode === LoopMode.ONE) {
            const repeat = new Track({ ...this.current });
            this.current = null;
            this.queue.unshift(repeat);
        } else if (this.loopMode === LoopMode.ALL) {
            this.queue.push(new Track({ ...this.current }));
            this.current = null;
        } else {
            this.current = null;
        }

        this.playNext();
    }

    pause() {
        if (this.isPlaying) {
            this.player.pause();
            this.paused = true;
            return true;
        }
        return false;
    }

    resume() {
        if (this.isPaused) {
            this.player.unpause();
            this.paused = false;
            return true;
        }
        return false;
    }

    skip() {
        if (this.current) {
            if (this.loopMode === LoopMode.ONE) {
                this.current = null;
            }
            this.player.stop();
            return true;
        }
        return false;
    }

    stop() {
        this.queue = [];
        this.current = null;
        this.loopMode = LoopMode.OFF;
        this.player.stop(true);
        this.startIdleTimeout();
    }

    setVolume(vol) {
        this.volume = clampVolume(vol);
        const resource = this.player.state.resource;
        if (resource instanceof AudioResource && resource.volume) {
            resource.volume.setVolume(this.volume / 100);
        }
    }

    setLoopMode(mode) {
        if (Object.values(LoopMode).includes(mode)) {
            this.loopMode = mode;
            return true;
        }
        return false;
    }

    removeTrack(index) {
        if (index >= 0 && index < this.queue.length) {
            return this.queue.splice(index, 1)[0];
        }
        return null;
    }

    clearQueue() {
        this.queue = [];
    }

    startIdleTimeout() {
        this.clearIdleTimeout();
        this.idleTimeout = setTimeout(() => {
            if (this.isIdle && !this.current) {
                logger.info({ guildId: this.guildId, step: 'MUSIC_IDLE_DISCONNECT' }, 'idle disconnect');
                this.destroy();
            }
        }, this.idleSeconds * 1000);
    }

    clearIdleTimeout() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
    }

    destroy() {
        this.stop();
        this.clearIdleTimeout();
        if (this.connection) {
            try { this.connection.destroy(); } catch { /* already destroyed */ }
            this.connection = null;
        }
    }

    cleanup() {
        this.queue = [];
        this.current = null;
        this.paused = false;
        this.clearIdleTimeout();
        this.player.stop(true);
    }

    getStatus() {
        return {
            playing: this.isPlaying,
            paused: this.isPaused,
            current: this.current,
            queue: this.queue.slice(0, 10),
            queueLength: this.queue.length,
            loopMode: this.loopMode,
            volume: this.volume,
            channelId: this.connection?.joinConfig?.channelId ?? null,
        };
    }
}
