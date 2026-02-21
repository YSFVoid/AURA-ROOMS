import { Client, GatewayIntentBits } from 'discord.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/mongo.js';
import { registerInteractionCreateEvent } from './events/interactionCreate.js';
import { registerReadyEvent } from './events/ready.js';
import { registerVoiceStateUpdateEvent } from './events/voiceStateUpdate.js';
import { AbuseService } from './services/abuseService.js';
import { AuditLogService } from './services/auditLogService.js';
import { PermissionService } from './services/permissionService.js';
import { RoomService } from './services/roomService.js';
import { TemplateService } from './services/templateService.js';
import type { AppContext } from './types/index.js';
import { logger } from './utils/logger.js';
import { aboutCommand } from './commands/meta/about.js';
import { setupCommand } from './commands/setup/setup.js';
import { roomCommand, roomButtonHandlers, roomModalHandlers, roomSelectHandlers } from './commands/room/panel.js';
import { templateCommand } from './commands/template/save.js';
import { templateListButtonHandlers } from './commands/template/list.js';
import { setupWizardButtonHandlers } from './commands/setup/wizard.js';
import {
  setupImportButtonHandlers,
  setupImportModalHandler,
} from './commands/setup/import.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  const permissionService = new PermissionService();
  const abuseService = new AbuseService();
  const auditLogService = new AuditLogService(client);
  const roomService = new RoomService(client, permissionService, abuseService, auditLogService);
  const templateService = new TemplateService(permissionService);

  const commands = new Map([
    [aboutCommand.data.name, aboutCommand],
    [setupCommand.data.name, setupCommand],
    [roomCommand.data.name, roomCommand],
    [templateCommand.data.name, templateCommand],
  ]);

  const context: AppContext = {
    client,
    commands,
    buttonHandlers: [
      ...setupWizardButtonHandlers,
      ...setupImportButtonHandlers,
      ...roomButtonHandlers,
      ...templateListButtonHandlers,
    ],
    selectMenuHandlers: [...roomSelectHandlers],
    modalHandlers: [...roomModalHandlers, setupImportModalHandler],
    roomService,
    permissionService,
    templateService,
    abuseService,
    auditLogService,
    startedAt: Date.now(),
  };

  registerReadyEvent(client, context);
  registerInteractionCreateEvent(client, context);
  registerVoiceStateUpdateEvent(client, context);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    try {
      client.destroy();
      await disconnectDatabase();
    } catch (error) {
      logger.error({ error }, 'Shutdown error');
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await client.login(env.DISCORD_TOKEN);
}

bootstrap().catch((error) => {
  logger.fatal({ error }, 'Bootstrap failed');
  process.exit(1);
});
