interface TransientRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxTotalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientRetry(
  fetcher: () => Promise<Response>,
  opts: TransientRetryOptions = {},
): Promise<Response> {
  const { maxAttempts = 2, baseDelayMs = 500, maxTotalMs = 20_000 } = opts;
  const deadline = Date.now() + maxTotalMs;

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && Date.now() >= deadline) break;

    try {
      const response = await fetcher();

      if (response.status < 500) return response;

      lastResponse = response;
    } catch (e) {
      lastError = e;
    }

    if (attempt < maxAttempts - 1 && Date.now() < deadline) {
      const jitter = 1 + Math.random() * 0.3;
      await sleep(baseDelayMs * Math.pow(2, attempt) * jitter);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError;
}
