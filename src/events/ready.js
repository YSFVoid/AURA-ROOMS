import { ActivityType } from 'discord.js';
import { Branding } from '../config/constants.js';
import { normalizeAllGuildSettingsDefaults } from '../db/repos/guildSettingsRepo.js';
import { logger } from '../utils/logger.js';

export function handleReady(client, context) {
    client.once('clientReady', async () => {
        logger.info({ tag: client.user?.tag }, `${Branding.NAME} is ready`);

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
