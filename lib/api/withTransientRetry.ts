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

    let retryAfterMs = 0;
    try {
      const response = await fetcher();

      // 429 is retryable too — our own Fly services (nado-matches,
      // nado-funding) now fail closed on their internal rate limiter and
      // return 429 instead of silently proceeding past budget. Without this,
      // a transient budget-exhaustion 429 would surface as a bare "service
      // request failed" 502 to the client instead of being absorbed here.
      if (response.status < 500 && response.status !== 429) return response;

      if (response.status === 429) {
        const ra = response.headers.get("Retry-After");
        const parsed = ra ? parseInt(ra, 10) : NaN;
        if (Number.isFinite(parsed)) retryAfterMs = parsed * 1000;
      }

      lastResponse = response;
    } catch (e) {
      lastError = e;
    }

    if (attempt < maxAttempts - 1 && Date.now() < deadline) {
      const jitter = 1 + Math.random() * 0.3;
      const backoff = baseDelayMs * Math.pow(2, attempt) * jitter;
      await sleep(Math.max(backoff, retryAfterMs));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError;
}
