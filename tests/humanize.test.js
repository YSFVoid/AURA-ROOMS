import { describe, it, expect } from 'vitest';
import { humanizeKey, humanizeEventKey, humanizeDecisionCode } from '../src/utils/humanize.js';

describe('humanizeKey', () => {
    it('converts UPPER_SNAKE to Title Case', () => {
        expect(humanizeKey('ROOM_CREATED')).toBe('Room Created');
    });

    it('converts kebab-case to Title Case', () => {
        expect(humanizeKey('room-created')).toBe('Room Created');
    });

    it('returns Unknown for empty string', () => {
        expect(humanizeKey('')).toBe('Unknown');
    });

    it('returns Unknown for null', () => {
        expect(humanizeKey(null)).toBe('Unknown');
    });

    it('returns Unknown for undefined', () => {
        expect(humanizeKey(undefined)).toBe('Unknown');
    });

    it('handles single word', () => {
        expect(humanizeKey('SUCCESS')).toBe('Success');
    });
});

describe('humanizeEventKey', () => {
    it('uses override map for known events', () => {
        expect(humanizeEventKey('SETUP_WIZARD_RUN')).toBe('Setup Completed');
        expect(humanizeEventKey('ROOM_CREATED')).toBe('Room Created');
        expect(humanizeEventKey('ROOM_DELETED')).toBe('Room Deleted');
        expect(humanizeEventKey('TEMPLATE_APPLIED')).toBe('Template Applied');
    });

    it('falls back to humanizeKey for unknown events', () => {
        expect(humanizeEventKey('CUSTOM_EVENT')).toBe('Custom Event');
    });

    it('returns Event for null', () => {
        expect(humanizeEventKey(null)).toBe('Event');
    });
});

describe('humanizeDecisionCode', () => {
    it('uses override map for known codes', () => {
        expect(humanizeDecisionCode('CREATE_COOLDOWN')).toBe('Create Cooldown');
        expect(humanizeDecisionCode('MAX_ROOMS')).toBe('Max Rooms Reached');
    });

    it('falls back to humanizeKey for unknown codes', () => {
        expect(humanizeDecisionCode('CUSTOM_CODE')).toBe('Custom Code');
    });

    it('returns Decision for null', () => {
        expect(humanizeDecisionCode(null)).toBe('Decision');
    });
});
