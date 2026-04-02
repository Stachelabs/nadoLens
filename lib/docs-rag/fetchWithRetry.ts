import { log } from "./logger"

export type FetchRetryOptions = {
  timeoutMs: number
  maxRetries: number
  userAgent: string
}

const DEFAULT_UA = "NadoLensDocsBot/1.0 (+https://github.com/nadoLens)"

function jitterMs(base: number): number {
  return base + Math.floor(Math.random() * 400)
}

export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions,
): Promise<Response> {
  let attempt = 0
  let lastErr: unknown
  while (attempt <= options.maxRetries) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": options.userAgent || DEFAULT_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      })
      clearTimeout(timer)
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      attempt += 1
      if (attempt > options.maxRetries) break
      const backoff = jitterMs(800 * 2 ** (attempt - 1))
      log("warn", "fetch_retry", {
        url,
        attempt,
        backoff_ms: backoff,
        err: err instanceof Error ? err.message : String(err),
      })
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? "fetch failed"))
}
