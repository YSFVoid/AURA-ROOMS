import type { Client } from 'discord.js';
import { isLobby } from '../db/repos/lobbyRepo.js';
import type { AppContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

export function registerVoiceStateUpdateEvent(client: Client, context: AppContext): void {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      if (newState.member?.user.bot || oldState.member?.user.bot) {
        return;
      }

      if (oldState.channelId === newState.channelId) {
        return;
      }

      const member = newState.member ?? oldState.member;
      if (!member) {
        return;
      }

      if (newState.guild.id !== member.guild.id) {
        return;
      }

      if (newState.channelId) {
        const joinedLobby = await isLobby(member.guild.id, newState.channelId);
        if (joinedLobby) {
          await context.roomService.handleLobbyJoin(member, newState.channelId);
          return;
        }
      }

      if (oldState.channelId) {
        const oldRoom = await context.roomService.getTrackedRoom(oldState.channelId);
        if (oldRoom) {
          if (oldState.channel && oldState.channel.members.size === 0) {
            await context.roomService.scheduleEmptyDelete(oldState.channelId);
          } else {
            await context.roomService.handleOwnershipTransfer(oldState.channelId);
          }
        }
      }

      if (newState.channelId) {
        const newRoom = await context.roomService.getTrackedRoom(newState.channelId);
        if (newRoom) {
          context.roomService.cancelEmptyDelete(newState.channelId);
          await context.roomService.markRoomActive(newState.channelId);
        }
      }
    } catch (error) {
      logger.error({ error }, 'voiceStateUpdate handler failed');
    }
  });
}
