/**
 * Normalize internal docs URLs for deduplication and graph edges.
 * - Same origin only (caller filters)
 * - Strip hash and query (robots disallow search query patterns; docs are path-based)
 * - Strip trailing slash except root
 */
export function normalizeInternalUrl(
  baseOrigin: string,
  href: string,
  resolveAgainst: string,
): string | null {
  let resolved: URL
  try {
    resolved = new URL(href, resolveAgainst)
  } catch {
    return null
  }

  const origin = new URL(baseOrigin).origin
  if (resolved.origin !== origin) return null

  resolved.hash = ""
  resolved.search = ""

  let path = resolved.pathname
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1)
  }

  return `${resolved.origin}${path}`
}

export function safeMarkdownFilename(url: string): string {
  const u = new URL(url)
  const base =
    u.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\//g, "__")
      .replace(/[^a-zA-Z0-9._-]/g, "_") || "index"
  return `${base.slice(0, 180)}.md`
}
