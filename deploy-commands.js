import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { env } from './src/config/env.js';
import { getCommandPayloads } from './src/commands/registry.js';

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

async function deploy() {
    const debugEnabled = env.DEBUG_COMMANDS?.trim() === 'true';
    const commands = getCommandPayloads({ debugEnabled });
    const commandNames = commands.map((command) => command.name);
    console.log(`Commands (${commandNames.length}): ${commandNames.join(', ')}`);
    const guildId = env.GUILD_ID?.trim();

    if (guildId) {
        console.log(`Mode: guild (${guildId})`);
        console.log('Clearing scope: global');
        await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [] });
        console.log(`Setting scope: guild:${guildId}`);
        await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, guildId), { body: commands });
        console.log(`Deploy complete. Cleared: global. Set: guild:${guildId}`);
        return;
    }

    console.log('Mode: global');
    const clearGuildId = process.env.CLEAR_GUILD_ID?.trim() || process.env.GUILD_ID?.trim();
    if (clearGuildId) {
        console.log(`Clearing scope: guild:${clearGuildId}`);
        await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, clearGuildId), { body: [] });
    } else {
        console.log('Clearing scope: guild skipped (no CLEAR_GUILD_ID provided)');
    }
    console.log('Setting scope: global');
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: commands });
    console.log('Deploy complete. Cleared: guild (if provided). Set: global');
}

deploy().catch((error) => {
    console.error('Deploy failed:', error?.message ?? error);
    process.exit(1);
});
