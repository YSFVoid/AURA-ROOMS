const MAX_QUEUE_SIZE = 100;
const MAX_URL_LENGTH = 512;
const ALLOWED_EXTENSIONS = ['.mp3', '.ogg', '.webm', '.wav', '.flac', '.m4a', '.aac'];
const URL_PATTERN = /^https?:\/\/.+/i;

export function validateTrackUrl(url) {
    if (!url || typeof url !== 'string') return { ok: false, reason: 'No URL provided.' };
    if (url.length > MAX_URL_LENGTH) return { ok: false, reason: `URL too long (max ${MAX_URL_LENGTH}).` };
    if (!URL_PATTERN.test(url)) return { ok: false, reason: 'Must be a valid HTTP/HTTPS URL.' };

    const lower = url.toLowerCase().split('?')[0];
    const hasExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!hasExt) return { ok: false, reason: `Supported formats: ${ALLOWED_EXTENSIONS.join(', ')}` };

    return { ok: true };
}

export function validateQueueSize(currentSize) {
    if (currentSize >= MAX_QUEUE_SIZE) return { ok: false, reason: `Queue is full (max ${MAX_QUEUE_SIZE}).` };
    return { ok: true };
}

export function clampVolume(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return 50;
    return Math.max(0, Math.min(100, Math.round(num)));
}

export const MusicLimits = {
    MAX_QUEUE_SIZE,
    MAX_URL_LENGTH,
    ALLOWED_EXTENSIONS,
};
