import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { PrivacyMode } from '../config/constants.js';
import type { AbuseService } from '../services/abuseService.js';
import type { AuditLogService } from '../services/auditLogService.js';
import type { PermissionService } from '../services/permissionService.js';
import type { RoomService } from '../services/roomService.js';
import type { TemplateService } from '../services/templateService.js';

export interface CommandDataLike {
  name: string;
  toJSON: () => unknown;
}

export interface SlashCommandModule {
  data: CommandDataLike;
  execute: (interaction: ChatInputCommandInteraction, context: AppContext) => Promise<void>;
}

export type CustomIdMatcher = string | RegExp | ((customId: string) => boolean);

export interface ButtonHandler {
  customId: CustomIdMatcher;
  execute: (interaction: ButtonInteraction, context: AppContext) => Promise<void>;
}

export interface SelectMenuHandler {
  customId: CustomIdMatcher;
  execute: (interaction: StringSelectMenuInteraction, context: AppContext) => Promise<void>;
}

export interface ModalHandler {
  customId: CustomIdMatcher;
  execute: (interaction: ModalSubmitInteraction, context: AppContext) => Promise<void>;
}

export interface AppContext {
  client: Client;
  commands: Map<string, SlashCommandModule>;
  buttonHandlers: ButtonHandler[];
  selectMenuHandlers: SelectMenuHandler[];
  modalHandlers: ModalHandler[];
  roomService: RoomService;
  permissionService: PermissionService;
  templateService: TemplateService;
  abuseService: AbuseService;
  auditLogService: AuditLogService;
  startedAt: number;
}

export interface GuildSettingsData {
  guildId: string;
  categoryId?: string;
  logChannelId?: string;
  defaultTemplate: string;
  defaultPrivacy: PrivacyMode;
  defaultUserLimit: number;
  emptyDeleteSeconds: number;
  createCooldownSeconds: number;
  maxRoomsPerUser: number;
  trustedRoleIds: string[];
  djRoleId?: string;
  setupCompletedAt?: Date;
}

export interface ExportData {
  version: number;
  exportedAt: string;
  guildSettings: {
    categoryId?: string;
    logChannelId?: string;
    defaultTemplate?: string;
    defaultPrivacy?: PrivacyMode;
    defaultUserLimit?: number;
    emptyDeleteSeconds?: number;
    createCooldownSeconds?: number;
    maxRoomsPerUser?: number;
    trustedRoleIds?: string[];
    djRoleId?: string;
    setupCompletedAt?: string;
  };
  lobbies: Array<{ lobbyChannelId: string }>;
}

export type AbuseDecisionCode =
  | 'OK'
  | 'CREATE_COOLDOWN'
  | 'MAX_ROOMS'
  | 'JOIN_LEAVE_LIMIT'
  | 'GUILD_RATE_LIMIT';

export interface AbuseDecision {
  allowed: boolean;
  code: AbuseDecisionCode;
  message?: string;
  retryAfterSeconds?: number;
}

export interface RoomPanelState {
  roomChannelId: string;
  ownerId: string;
  privacyMode: PrivacyMode;
  userLimit: number;
  activityTag?: string;
  autoNameEnabled: boolean;
}

export interface PendingImportConfirmation {
  id: string;
  guildId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  payload: ExportData;
}
