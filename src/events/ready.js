import { ActivityType } from 'discord.js';
import { join } from 'node:path';
import { Branding } from '../config/constants.js';
import { env } from '../config/env.js';
import { normalizeAllGuildSettingsDefaults } from '../db/repos/guildSettingsRepo.js';
import { logger } from '../utils/logger.js';

export function handleReady(client, context) {
    client.once('clientReady', async () => {
        logger.info({
            event: 'BOOT',
            pid: process.pid,
            cwd: process.cwd(),
            lockPath: join(process.cwd(), '.aura-rooms.lock'),
            nodeEnv: env.NODE_ENV,
            guildCount: client.guilds.cache.size,
            tag: client.user?.tag,
        }, `${Branding.NAME} is ready`);

        if (client.user) {
            client.user.setPresence({
                status: 'dnd',
                activities: [{ name: Branding.PRESENCE_TEXT, type: ActivityType.Listening }],
            });
        }

        try {
            await normalizeAllGuildSettingsDefaults();
        } catch (error) {
            logger.warn({ error }, 'Failed to normalize guild settings defaults');
        }

        try {
            await context.roomService.onStartupOrphanCleanup();
        } catch (error) {
            logger.warn({ error }, 'Orphan cleanup encountered an issue');
        }
    });
}
