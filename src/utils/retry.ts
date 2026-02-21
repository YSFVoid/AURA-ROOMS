export async function withRetries<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 50,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= retries) {
        break;
      }

      const delay = baseDelayMs * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
