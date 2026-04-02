import * as cheerio from "cheerio"
import { normalizeInternalUrl } from "./urlNormalize"

export function extractAnchorsFromHtml(
  html: string,
  pageUrl: string,
  baseOrigin: string,
): Array<{ href: string; text: string }> {
  const $ = cheerio.load(html)
  const out: Array<{ href: string; text: string }> = []
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return
    if (
      href.startsWith("mailto:") ||
      href.startsWith("javascript:") ||
      href.startsWith("#")
    ) {
      return
    }
    const normalized = normalizeInternalUrl(baseOrigin, href, pageUrl)
    if (!normalized) return
    const text = $(el).text().replace(/\s+/g, " ").trim()
    out.push({ href: normalized, text })
  })
  return dedupeByHref(out)
}

export function extractInternalLinkUrls(
  html: string,
  pageUrl: string,
  baseOrigin: string,
): string[] {
  return extractAnchorsFromHtml(html, pageUrl, baseOrigin).map((a) => a.href)
}

function dedupeByHref(
  items: Array<{ href: string; text: string }>,
): Array<{ href: string; text: string }> {
  const map = new Map<string, string>()
  for (const it of items) {
    if (!map.has(it.href)) map.set(it.href, it.text)
  }
  return [...map.entries()].map(([href, text]) => ({ href, text }))
}

/**
 * Navigation / sidebar links (GitBook + generic fallbacks).
 */
export function extractNavLinkUrls(
  html: string,
  pageUrl: string,
  baseOrigin: string,
): string[] {
  const $ = cheerio.load(html)
  const out = new Set<string>()
  const selectors = [
    "aside a[href]",
    "nav a[href]",
    '[data-testid="table-of-contents"] a[href]',
    '[class*="sidebar"] a[href]',
    '[class*="toc"] a[href]',
  ]
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr("href")
      if (!href) return
      const n = normalizeInternalUrl(baseOrigin, href, pageUrl)
      if (n) out.add(n)
    })
  }
  return [...out].sort()
}
