import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type APISelectMenuOption,
} from 'discord.js';
import { ComponentIds, PrivacyModes } from '../config/constants.js';
import { SafeLimits } from '../config/safeLimits.js';

export function createSetupWizardButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ComponentIds.SETUP_VIEW_STATUS)
      .setLabel('View Status')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ComponentIds.SETUP_EXPORT_CONFIG)
      .setLabel('Export Config')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ComponentIds.SETUP_OPEN_ROOM_PANEL)
      .setLabel('Open Room Panel')
      .setStyle(ButtonStyle.Primary),
  );
}

export function createSetupImportModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ComponentIds.SETUP_IMPORT_MODAL)
    .setTitle('Import AURA Config')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(ComponentIds.SETUP_IMPORT_JSON_INPUT)
          .setLabel('Paste JSON')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

export function createSetupImportConfirmButtons(
  token: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ComponentIds.SETUP_IMPORT_CONFIRM}:${token}`)
      .setLabel('Confirm Import')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${ComponentIds.SETUP_IMPORT_CANCEL}:${token}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function createRoomRenameModal(currentName: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ComponentIds.ROOM_RENAME_MODAL)
    .setTitle('Rename Room')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(ComponentIds.ROOM_RENAME_INPUT)
          .setLabel('New Name')
          .setStyle(TextInputStyle.Short)
          .setValue(currentName)
          .setRequired(true)
          .setMaxLength(SafeLimits.MAX_ROOM_NAME_LEN),
      ),
    );
}

export function createRoomLimitModal(currentLimit: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ComponentIds.ROOM_LIMIT_MODAL)
    .setTitle('Set User Limit')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(ComponentIds.ROOM_LIMIT_INPUT)
          .setLabel('Limit (0-99)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(currentLimit))
          .setRequired(true)
          .setMaxLength(2),
      ),
    );
}

export function createPermissionModal(customId: string, label: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Room Permission')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(ComponentIds.ROOM_PERMISSION_INPUT)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}

export function createRoomActivityModal(currentValue: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ComponentIds.ROOM_ACTIVITY_MODAL)
    .setTitle('Set Room Activity')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(ComponentIds.ROOM_ACTIVITY_INPUT)
          .setLabel('Activity Tag')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(currentValue)
          .setMaxLength(SafeLimits.MAX_ACTIVITY_TAG_LEN),
      ),
    );
}

export function createRoomPrimaryButtons(
  canClaim: boolean,
  autoNameEnabled: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_RENAME_BUTTON)
      .setLabel('Rename')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_LIMIT_BUTTON)
      .setLabel('User Limit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_ACTIVITY_BUTTON)
      .setLabel('Activity')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_AUTONAME_TOGGLE)
      .setLabel(autoNameEnabled ? 'AutoName: ON' : 'AutoName: OFF')
      .setStyle(autoNameEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_CLAIM_BUTTON)
      .setLabel('Claim')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canClaim),
  );
}

export function createRoomPermissionButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_ALLOW_USER_BUTTON)
      .setLabel('Allow User')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_DENY_USER_BUTTON)
      .setLabel('Deny User')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_ALLOW_ROLE_BUTTON)
      .setLabel('Allow Role')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(ComponentIds.ROOM_DENY_ROLE_BUTTON)
      .setLabel('Deny Role')
      .setStyle(ButtonStyle.Danger),
  );
}

export function createRoomPrivacyRow(currentMode: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const options: APISelectMenuOption[] = PrivacyModes.map((mode) => ({
    label: mode,
    value: mode,
    default: mode === currentMode,
  }));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ComponentIds.ROOM_PRIVACY_SELECT)
      .setPlaceholder('Privacy')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options),
  );
}

export function createRoomKickRow(
  options: APISelectMenuOption[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  const safeOptions = options.length > 0 ? options : [{ label: 'No members', value: 'none' }];

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ComponentIds.ROOM_KICK_SELECT)
      .setPlaceholder('Kick Member')
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(options.length === 0)
      .addOptions(safeOptions),
  );
}

export function createRoomTemplateRow(
  options: APISelectMenuOption[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  const safeOptions = options.length > 0 ? options : [{ label: 'No templates', value: 'none' }];

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ComponentIds.ROOM_TEMPLATE_SELECT)
      .setPlaceholder('Apply Template')
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(options.length === 0)
      .addOptions(safeOptions),
  );
}

export function createPaginationButtons(
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ComponentIds.TEMPLATE_LIST_PREV)
      .setLabel('Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(ComponentIds.TEMPLATE_LIST_NEXT)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}
