import { describe, it, expect } from 'vitest';
import { sanitizeRoomName, truncate, formatUptime } from '../src/utils/format.js';

describe('sanitizeRoomName', () => {
    it('preserves normal names', () => {
        expect(sanitizeRoomName("User's room", 'normal')).toBe("User's room");
    });

    it('replaces @everyone with everyone', () => {
        expect(sanitizeRoomName('@everyone channel', 'normal')).toBe('everyone channel');
    });

    it('replaces @here with here', () => {
        expect(sanitizeRoomName('@here room', 'normal')).toBe('here room');
    });

    it('collapses whitespace', () => {
        expect(sanitizeRoomName('too   many   spaces', 'normal')).toBe('too many spaces');
    });

    it('returns "room" for empty input', () => {
        expect(sanitizeRoomName('', 'normal')).toBe('room');
    });

    it('strict mode strips markdown chars', () => {
        expect(sanitizeRoomName('**bold** _italic_', 'strict')).toBe('bold italic');
    });

    it('truncates to max length', () => {
        const long = 'a'.repeat(200);
        const result = sanitizeRoomName(long, 'normal');
        expect(result.length).toBeLessThanOrEqual(100);
    });
});

describe('truncate', () => {
    it('returns input if short enough', () => {
        expect(truncate('hello', 10)).toBe('hello');
    });

    it('truncates with ellipsis', () => {
        expect(truncate('hello world this is long', 10)).toBe('hello w...');
    });

    it('handles max 3', () => {
        expect(truncate('hello', 3)).toBe('hel');
    });
});

describe('formatUptime', () => {
    it('formats seconds only', () => {
        expect(formatUptime(5000)).toBe('5s');
    });

    it('formats minutes and seconds', () => {
        expect(formatUptime(65000)).toBe('1m 5s');
    });

    it('formats hours', () => {
        expect(formatUptime(3661000)).toBe('1h 1m 1s');
    });

    it('formats days', () => {
        expect(formatUptime(86400000 + 3600000)).toBe('1d 1h 0m 0s');
    });
});
