import { randomUUID } from 'node:crypto';

export class Track {
    constructor({ title, url, requestedBy, duration, source }) {
        this.id = randomUUID();
        this.title = (title ?? 'Unknown').slice(0, 256);
        this.url = url;
        this.requestedBy = requestedBy;
        this.duration = duration ?? 0;
        this.source = source ?? 'url';
    }

    toEmbed() {
        return `**${this.title}** — <@${this.requestedBy}>`;
    }
}
