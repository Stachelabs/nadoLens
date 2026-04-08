/**
 * Maps Gateway-style perp pair strings to synced SVGs under public/icons/perps/.
 * Convention: "ETH-PERP" → /icons/perps/ETH.svg (sync script uses uppercase base tickers).
 */

/** "ETH-PERP" → "ETH", "BTC-PERP" → "BTC" */
export function perpBaseSymbolFromPair(pair: string): string {
  const dash = pair.indexOf("-");
  if (dash <= 0) return pair.trim().toUpperCase();
  return pair.slice(0, dash).trim().toUpperCase();
}

/** Public URL for the perp row icon (404 → Avatar fallback in UI). */
export function perpIconSrcFromPair(pair: string): string {
  const base = perpBaseSymbolFromPair(pair);
  return `/icons/perps/${base}.svg`;
}
