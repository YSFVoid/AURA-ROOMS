import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { AuraPanelIds, ComponentIds, PrivacyModes } from '../config/constants.js';
import { SafeLimits } from '../config/safeLimits.js';
import { PurpleOS } from './theme.js';

export function createSetupActionButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(ComponentIds.SETUP_POST_LOBBY_INFO)
            .setLabel('Post Lobby Info')
            .setEmoji(PurpleOS.Icons.INFO)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(ComponentIds.SETUP_OPEN_ROOM_PANEL)
            .setLabel('Room Panel Help')
            .setEmoji(PurpleOS.Icons.GEAR)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(ComponentIds.SETUP_EXPORT_CONFIG)
            .setLabel('Export Config')
            .setEmoji(PurpleOS.Icons.TEMPLATE)
            .setStyle(ButtonStyle.Secondary),
    );
}

export function createSetupImportModal() {
    return new ModalBuilder()
        .setCustomId(ComponentIds.SETUP_IMPORT_MODAL)
        .setTitle('AURA Rooms Import Configuration')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(ComponentIds.SETUP_IMPORT_JSON_INPUT)
                    .setLabel('Paste JSON')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true),
            ),
        );
}

export function createSetupImportConfirmButtons(token) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${ComponentIds.SETUP_IMPORT_CONFIRM}:${token}`)
            .setLabel('Confirm Import')
            .setEmoji(PurpleOS.Icons.ALLOW)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`${ComponentIds.SETUP_IMPORT_CANCEL}:${token}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );
}

export function createRoomRenameModal(currentName) {
    return new ModalBuilder()
        .setCustomId(ComponentIds.ROOM_RENAME_MODAL)
        .setTitle('AURA Rooms Rename Room')
        .addComponents(
            new ActionRowBuilder().addComponents(
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

export function createRoomLimitModal(currentLimit) {
    return new ModalBuilder()
        .setCustomId(ComponentIds.ROOM_LIMIT_MODAL)
        .setTitle('AURA Rooms Set User Limit')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(ComponentIds.ROOM_LIMIT_INPUT)
                    .setLabel('Limit (0 = unlimited, max 99)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentLimit))
                    .setRequired(true)
                    .setMaxLength(2),
            ),
        );
}

export function createPermissionModal(customId, label) {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle('AURA Rooms Room Permission')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(ComponentIds.ROOM_PERMISSION_INPUT)
                    .setLabel(label)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true),
            ),
        );
}

export function createRoomActivityModal(currentValue) {
    return new ModalBuilder()
        .setCustomId(ComponentIds.ROOM_ACTIVITY_MODAL)
        .setTitle('AURA Rooms Set Activity')
        .addComponents(
            new ActionRowBuilder().addComponents(
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

export function createRoomControlRowA(locked, hidden) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_LOCK_TOGGLE)
            .setLabel(locked ? 'Unlock' : 'Lock')
            .setEmoji(locked ? PurpleOS.Icons.UNLOCK : PurpleOS.Icons.LOCK)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_VISIBILITY_TOGGLE)
            .setLabel(hidden ? 'Show' : 'Hide')
            .setEmoji(hidden ? PurpleOS.Icons.SHOW : PurpleOS.Icons.HIDE)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_LIMIT_BUTTON)
            .setLabel('Limit')
            .setEmoji(PurpleOS.Icons.LIMIT)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_RENAME_BUTTON)
            .setLabel('Rename')
            .setEmoji(PurpleOS.Icons.RENAME)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_INFO_BUTTON)
            .setLabel('Info')
            .setEmoji(PurpleOS.Icons.INFO)
            .setStyle(ButtonStyle.Secondary),
    );
}

export function createRoomControlRowB(canClaim) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_CLAIM_BUTTON)
            .setLabel('Claim')
            .setEmoji(PurpleOS.Icons.CROWN)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!canClaim),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_ACTIVITY_BUTTON)
            .setLabel('Activity')
            .setEmoji(PurpleOS.Icons.ACTIVITY)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_AUTONAME_TOGGLE)
            .setLabel('AutoName')
            .setEmoji(PurpleOS.Icons.AUTONAME)
            .setStyle(ButtonStyle.Secondary),
    );
}

export function createRoomPermissionButtons(_allowedCount, _deniedCount) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_ALLOW_USER_BUTTON)
            .setLabel(`Allow User`)
            .setEmoji(PurpleOS.Icons.ALLOW)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_DENY_USER_BUTTON)
            .setLabel(`Deny User`)
            .setEmoji(PurpleOS.Icons.DENY)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_ALLOW_ROLE_BUTTON)
            .setLabel(`Allow Role`)
            .setEmoji(PurpleOS.Icons.ALLOW)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(ComponentIds.ROOM_DENY_ROLE_BUTTON)
            .setLabel(`Deny Role`)
            .setEmoji(PurpleOS.Icons.DENY)
            .setStyle(ButtonStyle.Danger),
    );
}

export function createRoomPrivacyRow(currentMode) {
    const modeEmoji = { public: '🌐', locked: '🔒', private: '🔐' };
    const options = PrivacyModes.map((mode) => ({
        label: `${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
        value: mode,
        emoji: modeEmoji[mode],
        default: mode === currentMode,
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(ComponentIds.ROOM_PRIVACY_SELECT)
            .setPlaceholder(`${PurpleOS.Icons.PRIVACY} Select Privacy Mode`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options),
    );
}

export function createRoomKickRow(options) {
    const safeOptions = options.length > 0 ? options : [{ label: 'No members', value: 'none', emoji: PurpleOS.Icons.MUTED }];

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(ComponentIds.ROOM_KICK_SELECT)
            .setPlaceholder(`${PurpleOS.Icons.KICK} Kick Member`)
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(options.length === 0)
            .addOptions(safeOptions),
    );
}

export function createRoomTemplateRow(options) {
    const safeOptions = options.length > 0 ? options : [{ label: 'No templates saved', value: 'none' }];

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(ComponentIds.ROOM_TEMPLATE_SELECT)
            .setPlaceholder(`${PurpleOS.Icons.TEMPLATE} Apply Template`)
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(options.length === 0)
            .addOptions(safeOptions),
    );
}

export function createAuraIconButton({ customId, icon, style = ButtonStyle.Secondary, disabled = false }) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(icon)
        .setStyle(style)
        .setDisabled(disabled);
}

export function createAuraMainGridRows(room, canClaim) {
    return [
        new ActionRowBuilder().addComponents(
            createAuraIconButton({ customId: AuraPanelIds.RENAME, icon: '\u270f\ufe0f' }),
            createAuraIconButton({ customId: AuraPanelIds.LIMIT, icon: '\u2699\ufe0f' }),
            createAuraIconButton({ customId: AuraPanelIds.LOCK, icon: room.locked ? '\ud83d\udd13' : '\ud83d\udd12' }),
            createAuraIconButton({ customId: AuraPanelIds.HIDE, icon: room.hidden ? '\ud83d\udc41\ufe0f' : '\ud83d\ude48' }),
        ),
        new ActionRowBuilder().addComponents(
            createAuraIconButton({ customId: AuraPanelIds.PRIVACY, icon: '\ud83d\udd10' }),
            createAuraIconButton({ customId: AuraPanelIds.ACTIVITY, icon: '\ud83c\udfae' }),
            createAuraIconButton({ customId: AuraPanelIds.AUTONAME, icon: '\ud83d\udd01' }),
            createAuraIconButton({ customId: AuraPanelIds.KICK_VIEW, icon: '\ud83d\uddd1\ufe0f' }),
        ),
        new ActionRowBuilder().addComponents(
            createAuraIconButton({ customId: AuraPanelIds.CLAIM, icon: '\ud83d\udc51', disabled: !canClaim }),
            createAuraIconButton({ customId: AuraPanelIds.REFRESH, icon: '\ud83d\udd04' }),
            createAuraIconButton({ customId: AuraPanelIds.PERMISSIONS, icon: '\ud83d\udee1\ufe0f' }),
            createAuraIconButton({ customId: AuraPanelIds.TEMPLATES, icon: '\ud83d\udce6' }),
        ),
    ];
}

export function createAuraExtrasRow() {
    return new ActionRowBuilder().addComponents(
        createAuraIconButton({ customId: AuraPanelIds.NOTE, icon: '\ud83d\udcdd' }),
        createAuraIconButton({ customId: AuraPanelIds.INFO, icon: '\u2139\ufe0f' }),
        createAuraIconButton({ customId: AuraPanelIds.BACK_VIEW, icon: '\u21a9' }),
    );
}

export function createAuraPermissionsRow() {
    return new ActionRowBuilder().addComponents(
        createAuraIconButton({ customId: AuraPanelIds.ALLOW_USER, icon: '\ud83d\udc64' }),
        createAuraIconButton({ customId: AuraPanelIds.DENY_USER, icon: '\ud83d\udeab' }),
        createAuraIconButton({ customId: AuraPanelIds.ALLOW_ROLE, icon: '\ud83c\udff7\ufe0f' }),
        createAuraIconButton({ customId: AuraPanelIds.DENY_ROLE, icon: '\u26d4' }),
        createAuraIconButton({ customId: AuraPanelIds.BACK_VIEW, icon: '\u21a9' }),
    );
}

export function createAuraTemplateActionRow(hasSelection) {
    return new ActionRowBuilder().addComponents(
        createAuraIconButton({
            customId: AuraPanelIds.TEMPLATES_APPLY,
            icon: '\u2705',
            disabled: !hasSelection,
        }),
        createAuraIconButton({ customId: AuraPanelIds.BACK_VIEW, icon: '\u21a9' }),
    );
}

export function createAuraActivityActionRow() {
    return new ActionRowBuilder().addComponents(
        createAuraIconButton({ customId: AuraPanelIds.BACK_VIEW, icon: '\u21a9' }),
    );
}

export function createAuraBackActionRow() {
    return new ActionRowBuilder().addComponents(
        createAuraIconButton({ customId: AuraPanelIds.BACK_VIEW, icon: '\u21a9' }),
    );
}

export function createAuraPrivacySelect(currentMode) {
    const options = PrivacyModes.map((mode) => ({
        label: `${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
        value: mode,
        default: mode === currentMode,
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(AuraPanelIds.PRIVACY_SELECT)
            .setPlaceholder('Privacy')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options),
    );
}

export function createAuraKickSelect(options) {
    const safeOptions =
        options.length > 0
            ? options
            : [{ label: 'No members', value: 'none' }];

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(AuraPanelIds.KICK_SELECT)
            .setPlaceholder('Kick')
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(options.length === 0)
            .addOptions(safeOptions),
    );
}

export function createAuraTemplateSelect(options, selectedName) {
    const safeOptions =
        options.length > 0
            ? options.map((option) => ({
                ...option,
                default: option.value === selectedName,
            }))
            : [{ label: 'No templates saved', value: 'none', default: false }];

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(AuraPanelIds.TEMPLATE_SELECT)
            .setPlaceholder('Templates')
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(options.length === 0)
            .addOptions(safeOptions),
    );
}

export function createAuraActivitySelect(currentValue) {
    const options = [
        { label: 'Gaming', value: 'Gaming' },
        { label: 'Study', value: 'Study' },
        { label: 'Chill', value: 'Chill' },
        { label: 'AFK', value: 'AFK' },
        { label: 'None', value: 'NONE' },
    ].map((option) => ({
        ...option,
        default: option.label === currentValue || (option.value === 'NONE' && !currentValue),
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(AuraPanelIds.ACTIVITY_SELECT)
            .setPlaceholder('Activity')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options),
    );
}

export function createAuraRenameModal(currentName) {
    return new ModalBuilder()
        .setCustomId(AuraPanelIds.MODAL_RENAME)
        .setTitle('Rename Room')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(AuraPanelIds.INPUT_RENAME)
                    .setLabel('Room Name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentName)
                    .setRequired(true)
                    .setMaxLength(SafeLimits.MAX_ROOM_NAME_LEN),
            ),
        );
}

export function createAuraLimitModal(currentLimit) {
    return new ModalBuilder()
        .setCustomId(AuraPanelIds.MODAL_LIMIT)
        .setTitle('User Limit')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(AuraPanelIds.INPUT_LIMIT)
                    .setLabel('Limit from 0 to 99')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentLimit))
                    .setRequired(true)
                    .setMaxLength(2),
            ),
        );
}

export function createAuraPermissionModal(modalId, inputId, label) {
    return new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Permission Target')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(inputId)
                    .setLabel(label)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true),
            ),
        );
}

export function createAuraNoteModal(currentNote) {
    return new ModalBuilder()
        .setCustomId(AuraPanelIds.MODAL_NOTE)
        .setTitle('Room Note')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(AuraPanelIds.INPUT_NOTE)
                    .setLabel('Note')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setValue(currentNote ?? '')
                    .setMaxLength(SafeLimits.MAX_ROOM_NOTE_LEN),
            ),
        );
}

export function createPaginationButtons(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(ComponentIds.TEMPLATE_LIST_PREV)
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(ComponentIds.TEMPLATE_LIST_NEXT)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
    );
}
