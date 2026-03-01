import { isLobby } from '../db/repos/lobbyRepo.js';
import { getByChannel } from '../db/repos/roomsRepo.js';
import { logger } from '../utils/logger.js';

export function handleVoiceStateUpdate(client, context) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const member = newState.member ?? oldState.member;
        if (!member || member.user.bot) return;

        const previousChannelId = oldState.channelId;
        const currentChannelId = newState.channelId;
        const guildId = newState.guild?.id ?? oldState.guild?.id;

        if (!guildId) return;

        try {
            if (currentChannelId && currentChannelId !== previousChannelId) {
                const lobby = await isLobby(guildId, currentChannelId);
                if (lobby) {
                    await context.roomService.handleLobbyJoin(member, currentChannelId, previousChannelId);
                } else {
                    const trackedRoom = await getByChannel(currentChannelId);
                    if (trackedRoom) {
                        await context.roomService.markRoomActive(currentChannelId);
                    }
                }
            }

            if (previousChannelId && previousChannelId !== currentChannelId) {
                const trackedRoom = await getByChannel(previousChannelId);
                if (trackedRoom) {
                    const channel = await context.roomService.fetchVoiceChannel(previousChannelId);

                    if (!channel || channel.members.size === 0) {
                        await context.roomService.scheduleEmptyDelete(previousChannelId);
                    } else {
                        await context.roomService.handleOwnershipTransfer(previousChannelId);
                    }
                }
            }
        } catch (error) {
            logger.error({ error, guildId, memberId: member.id }, 'voiceStateUpdate handler error');
        }
    });
}
