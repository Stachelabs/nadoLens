/**
 * Minimal robots.txt handling for same-origin crawl politeness.
 */

export type RobotsRules = {
  raw: string
  disallowPathPrefixes: string[]
  disallowPatterns: string[]
}

export function parseRobotsTxt(content: string): RobotsRules {
  const lines = content.split(/\r?\n/)
  let inAll = false
  const disallow: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (t.toLowerCase().startsWith("user-agent:")) {
      const ua = t.slice("user-agent:".length).trim()
      inAll = ua === "*"
      continue
    }
    if (!inAll) continue
    if (t.toLowerCase().startsWith("disallow:")) {
      const path = t.slice("disallow:".length).trim()
      if (path) disallow.push(path)
    }
  }
  const disallowPathPrefixes = disallow.filter(
    (p) => !p.includes("*") && !p.includes("?"),
  )
  const disallowPatterns = disallow.filter((p) => p.includes("*") || p.includes("?"))
  return { raw: content, disallowPathPrefixes, disallowPatterns }
}

export function isUrlAllowedByRobots(
  url: string,
  rules: RobotsRules,
): { allowed: boolean; reason?: string } {
  const u = new URL(url)
  const path = u.pathname
  const search = u.search

  for (const p of rules.disallowPathPrefixes) {
    if (p === "/") continue
    if (path.startsWith(p)) {
      return { allowed: false, reason: `disallow:${p}` }
    }
  }

  // Heuristic for Cloudflare `Disallow: /*?*q=*` style rules
  if (search && (search.includes("q=") || search.includes("ask="))) {
    return { allowed: false, reason: "disallowed_query" }
  }

  for (const pat of rules.disallowPatterns) {
    if (pat.includes("q=") && search.includes("q=")) {
      return { allowed: false, reason: `pattern:${pat}` }
    }
    if (pat.includes("ask=") && search.includes("ask=")) {
      return { allowed: false, reason: `pattern:${pat}` }
    }
  }

  return { allowed: true }
}
