interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 5,
  baseDelayMs: 400,
  maxDelayMs: 30_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withArchiveRetry(
  fetcher: () => Promise<Response>,
  opts: RetryOptions = {},
): Promise<Response> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULTS, ...opts };

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetcher();

    if (response.status !== 429) return response;

    lastResponse = response;

    if (attempt < maxAttempts - 1) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader
        ? Math.min(parseInt(retryAfterHeader, 10) * 1000, maxDelayMs)
        : 0;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + retryAfterMs,
        maxDelayMs,
      );
      await sleep(delay);
    }
  }

  return lastResponse!;
}
