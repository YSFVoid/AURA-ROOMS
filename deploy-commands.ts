import { REST, Routes } from 'discord.js';
import { env } from './src/config/env.js';
import { logger } from './src/utils/logger.js';
import { aboutCommand } from './src/commands/meta/about.js';
import { setupCommand } from './src/commands/setup/setup.js';
import { roomCommand } from './src/commands/room/panel.js';
import { templateCommand } from './src/commands/template/save.js';

const commands = [
  aboutCommand.data.toJSON(),
  setupCommand.data.toJSON(),
  roomCommand.data.toJSON(),
  templateCommand.data.toJSON(),
];

async function deployCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  if (env.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), {
      body: commands,
    });
    logger.info({ guildId: env.GUILD_ID, count: commands.length }, 'Deployed guild commands');
    return;
  }

  await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: commands });
  logger.info({ count: commands.length }, 'Deployed global commands');
}

deployCommands().catch((error) => {
  logger.fatal({ error }, 'Command deployment failed');
  process.exit(1);
});
