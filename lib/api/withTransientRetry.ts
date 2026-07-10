interface TransientRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxTotalMs?: number;
  // Default true: retry on a 429/5xx HTTP *response*, not just a thrown
  // network error. Correct for calls straight to Nado's Gateway/Trigger
  // (protocol/products, protocol/insurance-fund, trigger-orders,
  // linked-signer) — there, a 429/5xx is a genuine external transient
  // failure worth retrying.
  // Set to false for calls to OUR OWN Fly services (nado-matches,
  // nado-funding): those already retry Archive/Gateway internally (up to 4
  // attempts) and their 429 is a deliberate, final decision from their own
  // fail-closed rate limiter — not a transient blip. Retrying a response
  // like that just re-enters the already-saturated limiter and adds
  // pressure during exactly the overload it's failing closed to prevent.
  // With this false, only a *thrown* error (the Fly service itself
  // unreachable — deploy restart, cold start, network blip) is retried;
  // any HTTP response, whatever its status, is returned immediately.
  retryOnHttpStatus?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientRetry(
  fetcher: () => Promise<Response>,
  opts: TransientRetryOptions = {},
): Promise<Response> {
  const {
    maxAttempts = 2,
    baseDelayMs = 500,
    maxTotalMs = 20_000,
    retryOnHttpStatus = true,
  } = opts;
  const deadline = Date.now() + maxTotalMs;

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && Date.now() >= deadline) break;

    let retryAfterMs = 0;
    try {
      const response = await fetcher();

      if (!retryOnHttpStatus) return response;

      // 429 is retryable too — a genuine external transient failure from
      // Nado's own upstream (see retryOnHttpStatus doc above for when this
      // path applies).
      if (response.status < 500 && response.status !== 429) return response;

      if (response.status === 429) {
        const ra = response.headers.get("Retry-After");
        const parsed = ra ? parseInt(ra, 10) : NaN;
        // Clamp — an externally-controlled Retry-After must never be able to
        // sleep past this helper's own deadline budget (mirrors the clamp
        // already present in the Fly services' own retry helpers).
        if (Number.isFinite(parsed)) retryAfterMs = Math.min(parsed * 1000, maxTotalMs);
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
