import { logger } from '../utils/logger.js';
import { createErrorEmbed } from '../ui/embeds.js';
import { toSafeUserMessage } from '../utils/errors.js';
import { attachRequestId, createRequestId } from '../utils/requestContext.js';

export function handleInteractionCreate(client, context) {
    const { commands, buttonHandlers, selectMenuHandlers, modalHandlers } = context;

    client.on('interactionCreate', async (interaction) => {
        try {
            if (interaction.isChatInputCommand()) {
                const requestId = createRequestId();
                attachRequestId(interaction, requestId);

                const command = commands.get(interaction.commandName);
                if (!command) {
                    await interaction.reply({
                        embeds: [createErrorEmbed('Unknown Command', 'This command is not registered.')],
                        ephemeral: true,
                    });
                    return;
                }

                await command.execute(interaction, context);
                return;
            }

            if (interaction.isButton()) {
                const requestId = createRequestId();
                attachRequestId(interaction, requestId);

                for (const handler of buttonHandlers) {
                    const match =
                        typeof handler.customId === 'string'
                            ? interaction.customId === handler.customId
                            : handler.customId(interaction.customId);

                    if (match) {
                        await handler.execute(interaction, context);
                        return;
                    }
                }

                logger.warn({ customId: interaction.customId }, 'No button handler matched');
                return;
            }

            if (interaction.isStringSelectMenu()) {
                const requestId = createRequestId();
                attachRequestId(interaction, requestId);

                for (const handler of selectMenuHandlers) {
                    const match =
                        typeof handler.customId === 'string'
                            ? interaction.customId === handler.customId
                            : handler.customId(interaction.customId);

                    if (match) {
                        await handler.execute(interaction, context);
                        return;
                    }
                }

                logger.warn({ customId: interaction.customId }, 'No select menu handler matched');
                return;
            }

            if (interaction.isModalSubmit()) {
                const requestId = createRequestId();
                attachRequestId(interaction, requestId);

                for (const handler of modalHandlers) {
                    const match =
                        typeof handler.customId === 'string'
                            ? interaction.customId === handler.customId
                            : handler.customId(interaction.customId);

                    if (match) {
                        await handler.execute(interaction, context);
                        return;
                    }
                }

                logger.warn({ customId: interaction.customId }, 'No modal handler matched');
                return;
            }
        } catch (error) {
            logger.error({ error, interactionId: interaction.id }, 'Interaction handler error');

            const userMessage = toSafeUserMessage(error);

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        embeds: [createErrorEmbed('Error', userMessage)],
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        embeds: [createErrorEmbed('Error', userMessage)],
                        ephemeral: true,
                    });
                }
            } catch (replyError) {
                logger.error({ error: replyError }, 'Failed to send error response');
            }
        }
    });
}
