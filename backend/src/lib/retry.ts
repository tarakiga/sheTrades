export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts: number,
  delayMs: number,
  shouldRetry?: (error: unknown) => boolean
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = shouldRetry ? shouldRetry(error) : true;
      const hasRemainingAttempts = attempt < attempts;
      if (!retryable || !hasRemainingAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
