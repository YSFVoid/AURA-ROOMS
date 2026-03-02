export const Branding = {
    NAME: 'AURA Rooms',
    DESCRIPTION: 'Temp Voice Rooms (Phase 1)',
    FOOTER: 'YSF \u2022 Lone wolf developer',
    ABOUT_FOOTER: 'Developed by YSF (Lone wolf developer)',
    DEVELOPER: 'YSF (Lone wolf developer)',
    PRESENCE_TEXT: '/about \u2022 YSF',
};

export const ChannelNames = {
    CATEGORY: 'AURA Rooms',
    LOG: 'aura-logs',
    LOBBY: '\u2795 Create Room',
    INTERFACE: 'aura-interface',
};

export const Colors = {
    INFO: 0x7c3aed,
    SUCCESS: 0x22c55e,
    ERROR: 0xef4444,
    WARNING: 0xf59e0b,
};

export const PrivacyModes = ['public', 'locked', 'private'];

export const LogVerbosityLevels = ['minimal', 'normal', 'verbose'];

export const NamingPolicies = ['normal', 'strict'];

export const Defaults = {
    NAME_TEMPLATE: "{displayName}'s room",
    PRIVACY: 'locked',
    USER_LIMIT: 0,
    EMPTY_DELETE_SECONDS: 3,
    CREATE_COOLDOWN_SECONDS: 30,
    MAX_ROOMS_PER_USER: 1,
    JOIN_LEAVE_WINDOW_MS: 10_000,
    JOIN_LEAVE_MAX_EVENTS: 5,
    MAX_TEMPLATES_PER_USER: 25,
    TEMPLATE_PAGE_SIZE: 5,
    LOG_VERBOSITY: 'normal',
    NAMING_POLICY: 'normal',
    PANEL_ACTION_COOLDOWN_MS: 2000,
};

export const AuditEventTypes = {
    SETUP_WIZARD_RUN: 'SETUP_WIZARD_RUN',
    IMPORT_CONFIRMED: 'IMPORT_CONFIRMED',
    ROOM_CREATED: 'ROOM_CREATED',
    ROOM_DELETED: 'ROOM_DELETED',
    ROOM_TRANSFERRED: 'ROOM_TRANSFERRED',
    PRIVACY_CHANGED: 'PRIVACY_CHANGED',
    LOCK_TOGGLED: 'LOCK_TOGGLED',
    VISIBILITY_TOGGLED: 'VISIBILITY_TOGGLED',
    TEMPLATE_APPLIED: 'TEMPLATE_APPLIED',
};

export const ComponentIds = {
    SETUP_POST_LOBBY_INFO: 'setup:post-lobby-info',
    SETUP_EXPORT_CONFIG: 'setup:export-config',
    SETUP_OPEN_ROOM_PANEL: 'setup:open-room-panel',

    SETUP_IMPORT_MODAL: 'setup:import:modal',
    SETUP_IMPORT_JSON_INPUT: 'setup:import:json',
    SETUP_IMPORT_CONFIRM: 'setup:import:confirm',
    SETUP_IMPORT_CANCEL: 'setup:import:cancel',

    ROOM_LOCK_TOGGLE: 'room:lock:v1',
    ROOM_VISIBILITY_TOGGLE: 'room:hide:v1',
    ROOM_PRIVACY_SELECT: 'room:privacy:v1',
    ROOM_LIMIT_BUTTON: 'room:limit:v1',
    ROOM_LIMIT_MODAL: 'room:limit:modal:v1',
    ROOM_LIMIT_INPUT: 'room:limit:value',
    ROOM_RENAME_BUTTON: 'room:rename:v1',
    ROOM_RENAME_MODAL: 'room:rename:modal:v1',
    ROOM_RENAME_INPUT: 'room:rename:value',

    ROOM_KICK_SELECT: 'room:kick:v1',
    ROOM_CLAIM_BUTTON: 'room:claim:v1',
    ROOM_ACTIVITY_BUTTON: 'room:activity:v1',
    ROOM_ACTIVITY_MODAL: 'room:activity:modal:v1',
    ROOM_ACTIVITY_INPUT: 'room:activity:value',
    ROOM_AUTONAME_TOGGLE: 'room:autoname:v1',
    ROOM_INFO_BUTTON: 'room:info:v1',

    ROOM_ALLOW_USER_BUTTON: 'room:allowUser:v1',
    ROOM_DENY_USER_BUTTON: 'room:denyUser:v1',
    ROOM_ALLOW_ROLE_BUTTON: 'room:allowRole:v1',
    ROOM_DENY_ROLE_BUTTON: 'room:denyRole:v1',
    ROOM_PERMISSION_MODAL_ALLOW_USER: 'room:perm:allow-user:modal:v1',
    ROOM_PERMISSION_MODAL_DENY_USER: 'room:perm:deny-user:modal:v1',
    ROOM_PERMISSION_MODAL_ALLOW_ROLE: 'room:perm:allow-role:modal:v1',
    ROOM_PERMISSION_MODAL_DENY_ROLE: 'room:perm:deny-role:modal:v1',
    ROOM_PERMISSION_INPUT: 'room:perm:target',

    ROOM_TEMPLATE_SELECT: 'room:templateApply:v1',

    TEMPLATE_LIST_PREV: 'template:list:prev',
    TEMPLATE_LIST_NEXT: 'template:list:next',
};

export const AuraPanelIds = {
    RENAME: 'aura:rename',
    LOCK: 'aura:lock',
    HIDE: 'aura:hide',
    LIMIT: 'aura:limit',
    PRIVACY: 'aura:privacy',
    CLAIM: 'aura:claim',
    ACTIVITY: 'aura:activity',
    AUTONAME: 'aura:autoname',
    KICK: 'aura:kick',
    KICK_VIEW: 'aura:kick:view',
    REFRESH: 'aura:refresh',
    PERMISSIONS: 'aura:permissions',
    ALLOW_USER: 'aura:allowUser',
    DENY_USER: 'aura:denyUser',
    ALLOW_ROLE: 'aura:allowRole',
    DENY_ROLE: 'aura:denyRole',
    TEMPLATES: 'aura:templates',
    TEMPLATES_APPLY: 'aura:templates:apply',
    NOTE: 'aura:note',
    INFO: 'aura:info',
    BACK_MAIN: 'aura:back:main',
    BACK_VIEW: 'aura:view:back',
    TOOLS: 'aura:tools',
    MUSIC: 'aura:music',

    PRIVACY_SELECT: 'aura:privacy:select',
    KICK_SELECT: 'aura:kick:select',
    ACTIVITY_SELECT: 'aura:activity:select',
    TEMPLATE_SELECT: 'aura:templates:select',

    MODAL_RENAME: 'aura:modal:rename',
    INPUT_RENAME: 'aura:input:rename',
    MODAL_LIMIT: 'aura:modal:limit',
    INPUT_LIMIT: 'aura:input:limit',
    MODAL_ALLOW_USER: 'aura:modal:allowUser',
    INPUT_ALLOW_USER: 'aura:input:allowUser',
    MODAL_DENY_USER: 'aura:modal:denyUser',
    INPUT_DENY_USER: 'aura:input:denyUser',
    MODAL_ALLOW_ROLE: 'aura:modal:allowRole',
    INPUT_ALLOW_ROLE: 'aura:input:allowRole',
    MODAL_DENY_ROLE: 'aura:modal:denyRole',
    INPUT_DENY_ROLE: 'aura:input:denyRole',
    MODAL_NOTE: 'aura:modal:note',
    INPUT_NOTE: 'aura:input:note',

    MUSIC_PLAY: 'aura:music:play',
    MUSIC_PAUSE: 'aura:music:pause',
    MUSIC_RESUME: 'aura:music:resume',
    MUSIC_SKIP: 'aura:music:skip',
    MUSIC_STOP: 'aura:music:stop',
    MUSIC_LOOP: 'aura:music:loop',
    MUSIC_VOLUME: 'aura:music:volume',
    MUSIC_QUEUE: 'aura:music:queue',
    MODAL_MUSIC_PLAY: 'aura:modal:music:play',
    INPUT_MUSIC_URL: 'aura:input:music:url',
    MODAL_MUSIC_VOLUME: 'aura:modal:music:volume',
    INPUT_MUSIC_VOLUME: 'aura:input:music:volume',
};

export const ExportImportVersion = 1;
