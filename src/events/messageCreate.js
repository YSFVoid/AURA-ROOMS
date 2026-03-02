import { logger } from '../utils/logger.js';
import { createErrorEmbed } from '../ui/embeds.js';
import { env } from '../config/env.js';

export function handleMessageCreate(client, context) {
    const prefix = env.PREFIX?.trim() || '!';

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const commandName = args.shift()?.toLowerCase();
        if (!commandName) return;

        const handler = context.prefixCommands?.get(commandName);
        if (!handler) return;

        try {
            await handler.execute(message, args, context);
        } catch (error) {
            logger.error({ error, command: commandName, userId: message.author.id }, 'Prefix command error');
            await message.reply({
                embeds: [createErrorEmbed('Error', error.message ?? 'Something went wrong.')],
            }).catch(() => null);
        }
    });
}
