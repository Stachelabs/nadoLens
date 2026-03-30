/**
 * Nado Archive `matches` response: `txs[].timestamp` is **Unix epoch in seconds** (string).
 * See https://docs.nado.xyz/developer-resources/api/archive-indexer/matches
 *
 * `useWalletData` also stores an internal form: `(seconds * 1e9).toFixed(0)` so the same
 * string can be very large (~1e18). Values above 1e12 are treated as ns-scale (÷1e6 → ms);
 * smaller strings are treated as raw seconds (×1000 → ms).
 */
const SECONDS_VS_NS_THRESHOLD = 10n ** 12n

export function nanoStringToMs(raw: string): number | null {
  if (!raw || raw === "0") return null
  try {
    const n = BigInt(raw)
    if (n <= BigInt(0)) return null

    if (n < SECONDS_VS_NS_THRESHOLD) {
      const sec = Number(n)
      if (!Number.isFinite(sec)) return null
      const ms = sec * 1000
      return Number.isFinite(ms) ? ms : null
    }

    const ms = n / BigInt(1_000_000)
    const msNum = Number(ms)
    if (!Number.isFinite(msNum)) return null
    return msNum
  } catch {
    return null
  }
}

export function nanoStringToUnixSec(raw: string): number | null {
  const ms = nanoStringToMs(raw)
  if (ms === null) return null
  return Math.floor(ms / 1000)
}
