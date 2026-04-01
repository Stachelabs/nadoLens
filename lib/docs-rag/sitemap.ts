import * as cheerio from "cheerio"
import { fetchWithRetry } from "./fetchWithRetry"
import { log } from "./logger"
import { normalizeInternalUrl } from "./urlNormalize"

export async function fetchAllSitemapPageUrls(
  baseUrl: string,
  baseOrigin: string,
  fetchOpts: Parameters<typeof fetchWithRetry>[1],
): Promise<string[]> {
  const root = `${baseUrl.replace(/\/$/, "")}/sitemap.xml`
  try {
    return await collectSitemapUrlsRecursive(root, baseOrigin, fetchOpts, new Set())
  } catch (e) {
    log("warn", "sitemap_root_failed", {
      url: root,
      err: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

async function collectSitemapUrlsRecursive(
  sitemapUrl: string,
  baseOrigin: string,
  fetchOpts: Parameters<typeof fetchWithRetry>[1],
  visited: Set<string>,
): Promise<string[]> {
  if (visited.has(sitemapUrl)) return []
  visited.add(sitemapUrl)

  const res = await fetchWithRetry(sitemapUrl, fetchOpts)
  if (!res.ok) {
    log("warn", "sitemap_http_error", {
      status: res.status,
      url: sitemapUrl,
    })
    return []
  }
  const xml = await res.text()
  const $ = cheerio.load(xml, { xmlMode: true })
  const locs = $("loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)

  const pageUrls: string[] = []
  const nestedXml: string[] = []

  for (const loc of locs) {
    if (loc.toLowerCase().endsWith(".xml")) {
      nestedXml.push(loc)
    } else {
      const n = normalizeInternalUrl(baseOrigin, loc, sitemapUrl)
      if (n) pageUrls.push(n)
    }
  }

  for (const nx of nestedXml) {
    pageUrls.push(
      ...(await collectSitemapUrlsRecursive(nx, baseOrigin, fetchOpts, visited)),
    )
  }

  return pageUrls
}

export function parseSitemapXml(
  xml: string,
  baseOrigin: string,
  resolveAgainst: string,
): string[] {
  const $ = cheerio.load(xml, { xmlMode: true })
  const out = new Set<string>()
  $("loc").each((_, el) => {
    const t = $(el).text().trim()
    if (!t) return
    const n = normalizeInternalUrl(baseOrigin, t, resolveAgainst)
    if (n) out.add(n)
  })
  return [...out].sort()
}
