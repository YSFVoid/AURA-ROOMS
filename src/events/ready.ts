import { ActivityType, type Client } from 'discord.js';
import { Branding } from '../config/constants.js';
import type { AppContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

export function registerReadyEvent(client: Client, context: AppContext): void {
  client.once('ready', async () => {
    if (!client.user) {
      return;
    }

    client.user.setPresence({
      activities: [{ name: Branding.PRESENCE_TEXT, type: ActivityType.Listening }],
      status: 'online',
    });

    await context.roomService.onStartupOrphanCleanup();

    logger.info({ guilds: client.guilds.cache.size }, 'AURA Rooms is ready');
  });
}
