/** Strict deduplication for URL lists (already normalized). */
export function dedupeUrls(urls: readonly string[]): string[] {
  return [...new Set(urls)].sort((a, b) => a.localeCompare(b))
}
