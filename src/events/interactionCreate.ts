import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext, CustomIdMatcher } from '../types/index.js';
import { createErrorEmbed } from '../ui/embeds.js';
import { BotError, toSafeUserMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  attachRequestId,
  createRequestId,
  getRequestId,
  type AnyInteraction,
} from '../utils/requestContext.js';

function matcherMatch(matcher: CustomIdMatcher, customId: string): boolean {
  if (typeof matcher === 'string') {
    return matcher === customId;
  }

  if (matcher instanceof RegExp) {
    return matcher.test(customId);
  }

  return matcher(customId);
}

function interactionType(interaction: AnyInteraction): string {
  if (interaction.isChatInputCommand()) {
    return 'chat_input';
  }

  if (interaction.isButton()) {
    return 'button';
  }

  if (interaction.isStringSelectMenu()) {
    return 'select';
  }

  if (interaction.isModalSubmit()) {
    return 'modal';
  }

  return 'unknown';
}

async function replyError(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  message: string,
): Promise<void> {
  const requestId = getRequestId(interaction);
  const payload = {
    embeds: [
      createErrorEmbed('Error', message, [{ name: 'Reference ID', value: `\`${requestId}\`` }]),
    ],
    ephemeral: true,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
}

export function registerInteractionCreateEvent(client: Client, context: AppContext): void {
  client.on('interactionCreate', async (interaction) => {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isButton() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isModalSubmit()
    ) {
      return;
    }

    const requestId = createRequestId();
    attachRequestId(interaction, requestId);

    logger.info(
      {
        requestId,
        type: interactionType(interaction),
        guildId: interaction.guildId,
        userId: interaction.user.id,
        commandName: interaction.isChatInputCommand() ? interaction.commandName : undefined,
        customId:
          interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()
            ? interaction.customId
            : undefined,
      },
      'Interaction started',
    );

    try {
      if (interaction.isChatInputCommand()) {
        const command = context.commands.get(interaction.commandName);
        if (!command) {
          await interaction.reply({
            embeds: [
              createErrorEmbed('Command', 'Command handler not found.', [
                { name: 'Reference ID', value: `\`${requestId}\`` },
              ]),
            ],
            ephemeral: true,
          });
          return;
        }

        await command.execute(interaction, context);
        logger.info({ requestId, commandName: interaction.commandName }, 'Interaction succeeded');
        return;
      }

      if (interaction.isButton()) {
        const handler = context.buttonHandlers.find((entry) =>
          matcherMatch(entry.customId, interaction.customId),
        );

        if (!handler) {
          return;
        }

        await handler.execute(interaction, context);
        logger.info({ requestId, customId: interaction.customId }, 'Interaction succeeded');
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const handler = context.selectMenuHandlers.find((entry) =>
          matcherMatch(entry.customId, interaction.customId),
        );

        if (!handler) {
          return;
        }

        await handler.execute(interaction, context);
        logger.info({ requestId, customId: interaction.customId }, 'Interaction succeeded');
        return;
      }

      if (interaction.isModalSubmit()) {
        const handler = context.modalHandlers.find((entry) =>
          matcherMatch(entry.customId, interaction.customId),
        );

        if (!handler) {
          return;
        }

        await handler.execute(interaction, context);
        logger.info({ requestId, customId: interaction.customId }, 'Interaction succeeded');
      }
    } catch (error) {
      logger.error(
        {
          requestId,
          guildId: interaction.guildId,
          userId: interaction.user.id,
          type: interactionType(interaction),
          error,
        },
        'Interaction handler error',
      );

      if (error instanceof BotError) {
        await replyError(interaction, error.userMessage);
        return;
      }

      await replyError(interaction, toSafeUserMessage(error));
    }
  });
}
