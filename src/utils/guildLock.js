const guildQueue = new Map();

export async function runGuildExclusive(guildId, task) {
    const previous = guildQueue.get(guildId) ?? Promise.resolve();

    let release = () => { };
    const current = new Promise((resolve) => {
        release = resolve;
    });

    guildQueue.set(guildId, previous.then(() => current));

    try {
        await previous;
        return await task();
    } finally {
        release();
        const queued = guildQueue.get(guildId);
        if (queued === current) guildQueue.delete(guildId);
    }
}
