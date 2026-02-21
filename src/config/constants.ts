export const Branding = {
  NAME: 'AURA Rooms',
  DESCRIPTION: 'Temp Voice Rooms (Phase 1)',
  FOOTER: 'YSF • Lone wolf developer',
  ABOUT_FOOTER: 'Developed by YSF (Lone wolf developer)',
  DEVELOPER: 'YSF (Lone wolf developer)',
  PRESENCE_TEXT: '/about • YSF',
} as const;

export const ChannelNames = {
  CATEGORY: 'AURA Rooms',
  LOG: 'aura-logs',
  LOBBY: '➕ Create Room',
} as const;

export const Colors = {
  INFO: 0x5865f2,
  SUCCESS: 0x57f287,
  ERROR: 0xed4245,
  WARNING: 0xfee75c,
} as const;

export const PrivacyModes = ['public', 'locked', 'private'] as const;
export type PrivacyMode = (typeof PrivacyModes)[number];

export const Defaults = {
  NAME_TEMPLATE: "{displayName}'s room",
  PRIVACY: 'locked' as PrivacyMode,
  USER_LIMIT: 0,
  EMPTY_DELETE_SECONDS: 30,
  CREATE_COOLDOWN_SECONDS: 30,
  MAX_ROOMS_PER_USER: 1,
  JOIN_LEAVE_WINDOW_MS: 10_000,
  JOIN_LEAVE_MAX_EVENTS: 5,
  MAX_TEMPLATES_PER_USER: 25,
  TEMPLATE_PAGE_SIZE: 5,
} as const;

export const PermissionLabels = {
  MANAGE_CHANNELS: 'ManageChannels',
  MOVE_MEMBERS: 'MoveMembers',
  VIEW_CHANNEL: 'ViewChannel',
  CONNECT: 'Connect',
} as const;

export const ComponentIds = {
  SETUP_VIEW_STATUS: 'setup:view-status',
  SETUP_EXPORT_CONFIG: 'setup:export-config',
  SETUP_OPEN_ROOM_PANEL: 'setup:open-room-panel',

  SETUP_IMPORT_MODAL: 'setup:import:modal',
  SETUP_IMPORT_JSON_INPUT: 'setup:import:json',
  SETUP_IMPORT_CONFIRM: 'setup:import:confirm',
  SETUP_IMPORT_CANCEL: 'setup:import:cancel',

  ROOM_RENAME_BUTTON: 'room:rename',
  ROOM_RENAME_MODAL: 'room:rename:modal',
  ROOM_RENAME_INPUT: 'room:rename:value',

  ROOM_LIMIT_BUTTON: 'room:limit',
  ROOM_LIMIT_MODAL: 'room:limit:modal',
  ROOM_LIMIT_INPUT: 'room:limit:value',

  ROOM_PRIVACY_SELECT: 'room:privacy',

  ROOM_ALLOW_USER_BUTTON: 'room:allow-user',
  ROOM_DENY_USER_BUTTON: 'room:deny-user',
  ROOM_ALLOW_ROLE_BUTTON: 'room:allow-role',
  ROOM_DENY_ROLE_BUTTON: 'room:deny-role',

  ROOM_PERMISSION_MODAL_ALLOW_USER: 'room:perm:allow-user:modal',
  ROOM_PERMISSION_MODAL_DENY_USER: 'room:perm:deny-user:modal',
  ROOM_PERMISSION_MODAL_ALLOW_ROLE: 'room:perm:allow-role:modal',
  ROOM_PERMISSION_MODAL_DENY_ROLE: 'room:perm:deny-role:modal',
  ROOM_PERMISSION_INPUT: 'room:perm:target',

  ROOM_KICK_SELECT: 'room:kick',

  ROOM_CLAIM_BUTTON: 'room:claim',

  ROOM_ACTIVITY_BUTTON: 'room:activity',
  ROOM_ACTIVITY_MODAL: 'room:activity:modal',
  ROOM_ACTIVITY_INPUT: 'room:activity:value',

  ROOM_AUTONAME_TOGGLE: 'room:autoname',

  ROOM_TEMPLATE_SELECT: 'room:template-select',

  TEMPLATE_LIST_PREV: 'template:list:prev',
  TEMPLATE_LIST_NEXT: 'template:list:next',
} as const;

export const ExportImportVersion = 1;
