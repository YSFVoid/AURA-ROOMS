import { describe, it, expect } from 'vitest';
import { validateTrackUrl, validateQueueSize, clampVolume } from '../src/music/validators.js';
import { Track } from '../src/music/track.js';

describe('validateTrackUrl', () => {
    it('accepts valid mp3 URL', () => {
        expect(validateTrackUrl('https://example.com/track.mp3').ok).toBe(true);
    });

    it('accepts valid ogg URL', () => {
        expect(validateTrackUrl('https://example.com/track.ogg').ok).toBe(true);
    });

    it('accepts valid webm URL', () => {
        expect(validateTrackUrl('https://example.com/track.webm').ok).toBe(true);
    });

    it('rejects non-URL', () => {
        expect(validateTrackUrl('not a url').ok).toBe(false);
    });

    it('rejects empty string', () => {
        expect(validateTrackUrl('').ok).toBe(false);
    });

    it('rejects null', () => {
        expect(validateTrackUrl(null).ok).toBe(false);
    });

    it('rejects unsupported format', () => {
        expect(validateTrackUrl('https://example.com/video.mp4').ok).toBe(false);
    });

    it('rejects too-long URL', () => {
        const long = 'https://example.com/' + 'a'.repeat(500) + '.mp3';
        expect(validateTrackUrl(long).ok).toBe(false);
    });
});

describe('validateQueueSize', () => {
    it('allows when under limit', () => {
        expect(validateQueueSize(0).ok).toBe(true);
        expect(validateQueueSize(99).ok).toBe(true);
    });

    it('rejects when at limit', () => {
        expect(validateQueueSize(100).ok).toBe(false);
    });
});

describe('clampVolume', () => {
    it('clamps to 0-100', () => {
        expect(clampVolume(50)).toBe(50);
        expect(clampVolume(-10)).toBe(0);
        expect(clampVolume(150)).toBe(100);
        expect(clampVolume(0)).toBe(0);
        expect(clampVolume(100)).toBe(100);
    });

    it('handles NaN', () => {
        expect(clampVolume('abc')).toBe(50);
    });

    it('rounds floats', () => {
        expect(clampVolume(33.7)).toBe(34);
    });
});

describe('Track', () => {
    it('creates with defaults', () => {
        const track = new Track({ url: 'https://example.com/a.mp3', requestedBy: '123' });
        expect(track.id).toBeTruthy();
        expect(track.title).toBe('Unknown');
        expect(track.url).toBe('https://example.com/a.mp3');
        expect(track.requestedBy).toBe('123');
        expect(track.source).toBe('url');
    });

    it('truncates long titles', () => {
        const track = new Track({ title: 'x'.repeat(300), url: 'https://example.com/a.mp3', requestedBy: '1' });
        expect(track.title.length).toBe(256);
    });

    it('toEmbed returns formatted string', () => {
        const track = new Track({ title: 'My Song', url: 'https://example.com/a.mp3', requestedBy: '123' });
        expect(track.toEmbed()).toBe('**My Song** — <@123>');
    });
});
