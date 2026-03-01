import { isLobby } from '../db/repos/lobbyRepo.js';
import { getByChannel } from '../db/repos/roomsRepo.js';
import { logger } from '../utils/logger.js';
import { traceEvent } from '../utils/voiceTracer.js';

export function handleVoiceStateUpdate(client, context) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const member = newState.member ?? oldState.member;
        if (!member || member.user.bot) return;

        const previousChannelId = oldState.channelId;
        const currentChannelId = newState.channelId;
        const guildId = newState.guild?.id ?? oldState.guild?.id;

        if (!guildId) return;

        logger.debug({ guildId, userId: member.id, from: previousChannelId, to: currentChannelId }, 'voiceStateUpdate fired');

        try {
            if (currentChannelId && currentChannelId !== previousChannelId) {
                traceEvent(guildId, { userId: member.id, action: 'JOIN_DETECTED', toChannelId: currentChannelId, fromChannelId: previousChannelId, result: 'ok' });

                const lobby = await isLobby(guildId, currentChannelId);
                traceEvent(guildId, { userId: member.id, action: 'LOBBY_CHECK', lobbyChannelId: currentChannelId, result: lobby ? 'match' : 'no_match', reason: lobby ? 'Channel is a registered lobby' : 'Channel is not a lobby' });

                if (lobby) {
                    logger.info({ guildId, userId: member.id, lobbyId: currentChannelId }, 'Lobby join detected, creating room');
                    traceEvent(guildId, { userId: member.id, action: 'LOBBY_JOIN_START', lobbyChannelId: currentChannelId, result: 'pending' });

                    try {
                        await context.roomService.handleLobbyJoin(member, currentChannelId, previousChannelId);
                        traceEvent(guildId, { userId: member.id, action: 'LOBBY_JOIN_COMPLETE', lobbyChannelId: currentChannelId, result: 'success' });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        logger.error({ error, guildId, userId: member.id }, 'handleLobbyJoin failed');
                        traceEvent(guildId, { userId: member.id, action: 'LOBBY_JOIN_COMPLETE', lobbyChannelId: currentChannelId, result: 'error', reason: msg });
                    }
                } else {
                    const trackedRoom = await getByChannel(currentChannelId);
                    if (trackedRoom) {
                        await context.roomService.markRoomActive(currentChannelId);
                    }
                }
            }

            if (previousChannelId && previousChannelId !== currentChannelId) {
                traceEvent(guildId, { userId: member.id, action: 'LEAVE_DETECTED', fromChannelId: previousChannelId, result: 'ok' });

                const trackedRoom = await getByChannel(previousChannelId);
                if (trackedRoom) {
                    const channel = await context.roomService.fetchVoiceChannel(previousChannelId);

                    if (!channel || channel.members.size === 0) {
                        traceEvent(guildId, { userId: member.id, action: 'SCHEDULE_DELETE', fromChannelId: previousChannelId, result: 'empty' });
                        await context.roomService.scheduleEmptyDelete(previousChannelId);
                    } else {
                        await context.roomService.handleOwnershipTransfer(previousChannelId);
                    }
                }
            }
        } catch (error) {
            logger.error({ error, guildId, memberId: member.id }, 'voiceStateUpdate handler error');
            traceEvent(guildId, { userId: member.id, action: 'VSU_ERROR', result: 'error', reason: error instanceof Error ? error.message : String(error) });
        }
    });
}
