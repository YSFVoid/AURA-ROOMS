import { aboutCommand } from './meta/about.js';
import { debugCommand } from './meta/debug.js';
import { exportCommand } from './config/export.js';
import { importCommand } from './config/import.js';
import { presetCommand } from './preset/preset.js';
import { roomCommand } from './room/panel.js';
import { setupCommand } from './setup/setup.js';
import { templateCommand } from './template/save.js';

function assertUniqueCommandNames(commands) {
    const seen = new Set();
    for (const command of commands) {
        const name = command.data.name;
        if (seen.has(name)) {
            throw new Error(`Duplicate slash command name: ${name}`);
        }
        seen.add(name);
    }
}

export function getCommandModules(options = {}) {
    const debugEnabled = options.debugEnabled === true;
    const commands = [aboutCommand, setupCommand, exportCommand, importCommand, roomCommand, templateCommand, presetCommand];
    if (debugEnabled) {
        commands.push(debugCommand);
    }
    assertUniqueCommandNames(commands);
    return commands;
}

export function getCommandPayloads(options = {}) {
    return getCommandModules(options).map((command) => command.data.toJSON());
}
