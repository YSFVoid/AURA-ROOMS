import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { env } from './config/env.js';
import { connectDatabase } from './db/mongo.js';
import { logger } from './utils/logger.js';

import { SetupService } from './services/setupService.js';
import { RoomService } from './services/roomService.js';
import { PermissionService } from './services/permissionService.js';
import { TemplateService } from './services/templateService.js';
import { AbuseService } from './services/abuseService.js';
import { AuditLogService } from './services/auditLogService.js';

import { handleReady } from './events/ready.js';
import { handleInteractionCreate } from './events/interactionCreate.js';
import { handleVoiceStateUpdate } from './events/voiceStateUpdate.js';

import { aboutCommand } from './commands/meta/about.js';
import { debugCommand } from './commands/meta/debug.js';
import { setupCommand, setupButtonHandlers } from './commands/setup/setup.js';
import { exportCommand } from './commands/config/export.js';
import { importCommand, importButtonHandlers, importModalHandler } from './commands/config/import.js';
import { roomCommand, roomButtonHandlers, roomSelectHandlers, roomModalHandlers } from './commands/room/panel.js';
import { templateCommand } from './commands/template/save.js';
import { templateListButtonHandlers } from './commands/template/list.js';

async function main() {
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });

    await connectDatabase();

    const permissionService = new PermissionService();
    const abuseService = new AbuseService();
    const auditLogService = new AuditLogService(client);
    const setupService = new SetupService();
    const roomService = new RoomService(client, permissionService, abuseService, auditLogService);
    const templateService = new TemplateService(permissionService);

    const commands = new Collection();
    commands.set(aboutCommand.data.name, aboutCommand);
    commands.set(setupCommand.data.name, setupCommand);
    commands.set(exportCommand.data.name, exportCommand);
    commands.set(importCommand.data.name, importCommand);
    commands.set(roomCommand.data.name, roomCommand);
    commands.set(templateCommand.data.name, templateCommand);
    commands.set(debugCommand.data.name, debugCommand);

    const buttonHandlers = [
        ...setupButtonHandlers,
        ...importButtonHandlers,
        ...roomButtonHandlers,
        ...templateListButtonHandlers,
    ];

    const selectMenuHandlers = [...roomSelectHandlers];

    const modalHandlers = [importModalHandler, ...roomModalHandlers];

    const context = {
        commands,
        buttonHandlers,
        selectMenuHandlers,
        modalHandlers,
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

    await client.login(env.DISCORD_TOKEN);
}

main().catch((error) => {
    logger.fatal({ error }, 'Fatal startup error');
    process.exit(1);
});
