interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxTotalMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 15_000,
  maxTotalMs: 15_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withArchiveRetry(
  fetcher: () => Promise<Response>,
  opts: RetryOptions = {},
): Promise<Response> {
  const { maxAttempts, baseDelayMs, maxDelayMs, maxTotalMs } = { ...DEFAULTS, ...opts };
  const deadline = Date.now() + maxTotalMs;

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && Date.now() >= deadline) break;

    const response = await fetcher();

    if (response.status !== 429) return response;

    lastResponse = response;

    if (attempt < maxAttempts - 1 && Date.now() < deadline) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader
        ? Math.min(parseInt(retryAfterHeader, 10) * 1000, maxDelayMs)
        : 0;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + retryAfterMs,
        maxDelayMs,
        deadline - Date.now(),
      );
      await sleep(delay);
    }
  }

  return lastResponse!;
}
