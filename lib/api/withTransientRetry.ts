interface TransientRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientRetry(
  fetcher: () => Promise<Response>,
  opts: TransientRetryOptions = {},
): Promise<Response> {
  const { maxAttempts = 2, baseDelayMs = 300 } = opts;

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetcher();

      if (response.status < 500) return response;

      lastResponse = response;
    } catch (e) {
      lastError = e;
    }

    if (attempt < maxAttempts - 1) {
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError;
}
