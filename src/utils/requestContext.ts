import { randomUUID } from 'node:crypto';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

export type AnyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

const requestIdStore = new WeakMap<object, string>();

export function createRequestId(): string {
  return randomUUID();
}

export function attachRequestId(interaction: AnyInteraction, requestId: string): void {
  requestIdStore.set(interaction, requestId);
}

export function getRequestId(interaction: AnyInteraction): string {
  return requestIdStore.get(interaction) ?? 'unknown';
}
