const guildQueue = new Map<string, Promise<void>>();

export async function runGuildExclusive<T>(guildId: string, task: () => Promise<T>): Promise<T> {
  const previous = guildQueue.get(guildId) ?? Promise.resolve();

  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  guildQueue.set(guildId, previous.then(() => current));

  try {
    await previous;
    return await task();
  } finally {
    release();

    const queued = guildQueue.get(guildId);
    if (queued === current) {
      guildQueue.delete(guildId);
    }
  }
}
