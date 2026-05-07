/**
 * Maps Gateway-style perp pair strings to synced SVGs under public/icons/perps/.
 * Convention: "ETH-PERP" → /icons/perps/ETH.svg (sync script uses uppercase base tickers).
 */

import perpIconsManifest from '@/public/icons/perps/manifest.json'

/** "ETH-PERP" → "ETH", "BTC-PERP" → "BTC" */
export function perpBaseSymbolFromPair(pair: string): string {
  const dash = pair.indexOf("-");
  if (dash <= 0) return pair.trim().toUpperCase();
  return pair.slice(0, dash).trim().toUpperCase();
}

const AVAILABLE_PERP_ICONS = new Set(
  perpIconsManifest.entries
    .filter((entry) => entry.status === 'ok')
    .map((entry) => entry.marketKey.toUpperCase()),
)

/** Public URL for the perp row icon (null when icon was not synced). */
export function perpIconSrcFromPair(pair: string): string | null {
  const base = perpBaseSymbolFromPair(pair);
  if (!AVAILABLE_PERP_ICONS.has(base)) return null
  return `/icons/perps/${base}.svg`
}
