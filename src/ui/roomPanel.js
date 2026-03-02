import { renderAuraInterface } from './auraInterface.js';

export function buildRoomPanelBundle(params) {
    return renderAuraInterface(params);
}

export function buildRoomPanelEmbed(room, channel, owner, templates = [], canClaim = false, state = { view: 'main' }) {
    return renderAuraInterface({ room, owner, channel, templates, canClaim, state }).embed;
}

export function buildRoomPanelComponents(params) {
    return renderAuraInterface(params).components;
}
