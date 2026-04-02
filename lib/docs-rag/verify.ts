import type { Manifest } from "./types"

export type VerifyResult = {
  okUrls: Set<string>
  navMissing: string[]
  brokenInternalLinks: Array<{ from: string; to: string }>
  sitemapNotFetched: string[]
}

export function verifyManifest(manifest: Manifest): VerifyResult {
  const okUrls = new Set(
    manifest.pages.filter((p) => p.status === "ok").map((p) => p.url),
  )

  const navMissing = manifest.navLinksExpected.filter((u) => !okUrls.has(u))

  const brokenInternalLinks: Array<{ from: string; to: string }> = []
  for (const p of manifest.pages) {
    if (p.status !== "ok" || !p.linksOut) continue
    for (const link of p.linksOut) {
      const href = link.href
      if (!okUrls.has(href)) {
        brokenInternalLinks.push({ from: p.url, to: href })
      }
    }
  }

  const sitemapLeft = new Set(manifest.sitemapUrls)
  for (const u of okUrls) {
    sitemapLeft.delete(u)
  }
  const sitemapNotFetched = [...sitemapLeft].sort()

  return {
    okUrls,
    navMissing,
    brokenInternalLinks,
    sitemapNotFetched,
  }
}
