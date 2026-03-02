import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/mongo.js';
import { logger } from './utils/logger.js';
import { acquireSingleInstance, releaseSingleInstance } from './utils/singleInstance.js';

import { SetupService } from './services/setupService.js';
import { RoomService } from './services/roomService.js';
import { PermissionService } from './services/permissionService.js';
import { TemplateService } from './services/templateService.js';
import { AbuseService } from './services/abuseService.js';
import { AuditLogService } from './services/auditLogService.js';

import { handleReady } from './events/ready.js';
import { handleInteractionCreate } from './events/interactionCreate.js';
import { handleVoiceStateUpdate } from './events/voiceStateUpdate.js';
import { handleMessageCreate } from './events/messageCreate.js';

import { setupButtonHandlers } from './commands/setup/setup.js';
import { importButtonHandlers, importModalHandler } from './commands/config/import.js';
import { roomButtonHandlers, roomSelectHandlers, roomModalHandlers } from './commands/room/panel.js';
import { templateListButtonHandlers } from './commands/template/list.js';
import { getCommandModules } from './commands/registry.js';
import { getPrefixCommands } from './commands/prefix/prefixCommands.js';

function registerShutdownHandlers(client) {
    let shuttingDown = false;

    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ signal }, 'Shutting down');

        try {
            await disconnectDatabase();
        } catch (error) {
            logger.warn({ error }, 'Failed to disconnect MongoDB cleanly');
        }

        try {
            client.destroy();
        } catch (error) {
            logger.warn({ error }, 'Failed to destroy Discord client cleanly');
        }

        releaseSingleInstance();
        process.exit(0);
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('exit', () => {
        releaseSingleInstance();
    });
}

async function main() {
    if (!acquireSingleInstance()) {
        logger.fatal('Another AURA Rooms instance is already running');
        process.exit(1);
    }

    const prefixEnabled = env.PREFIX_ENABLED?.trim() === 'true';

    const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates];
    if (prefixEnabled) {
        intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
        logger.info('Prefix commands enabled, adding GuildMessages + MessageContent intents');
    }

    const client = new Client({ intents });
    registerShutdownHandlers(client);

    await connectDatabase();

    const permissionService = new PermissionService();
    const abuseService = new AbuseService();
    const auditLogService = new AuditLogService(client);
    const setupService = new SetupService();
    const templateService = new TemplateService(permissionService);
    const roomService = new RoomService(client, permissionService, abuseService, auditLogService, templateService);

    const commandModules = getCommandModules({ debugEnabled: env.DEBUG_COMMANDS?.trim() === 'true' });
    const commands = new Collection(commandModules.map((command) => [command.data.name, command]));

    const buttonHandlers = [
        ...setupButtonHandlers,
        ...importButtonHandlers,
        ...roomButtonHandlers,
        ...templateListButtonHandlers,
    ];

    const selectMenuHandlers = [...roomSelectHandlers];

    const modalHandlers = [importModalHandler, ...roomModalHandlers];

    const prefixCommands = prefixEnabled ? getPrefixCommands() : new Collection();

    const context = {
        commands,
        buttonHandlers,
        selectMenuHandlers,
        modalHandlers,
        prefixCommands,
        setupService,
        roomService,
        permissionService,
        templateService,
        abuseService,
        auditLogService,
    };

    handleReady(client, context);
    handleInteractionCreate(client, context);
    handleVoiceStateUpdate(client, context);

    if (prefixEnabled) {
        handleMessageCreate(client, context);
    }

    await client.login(env.DISCORD_TOKEN);
}

main().catch((error) => {
    releaseSingleInstance();
    logger.fatal({ error }, 'Fatal startup error');
    process.exit(1);
});
