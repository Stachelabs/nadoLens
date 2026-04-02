import { describe, expect, it } from "vitest"
import { loadDocsRagConfig } from "./config"
import { fetchAllSitemapPageUrls } from "./sitemap"
import { fetchWithRetry } from "./fetchWithRetry"

const run = process.env.NADO_DOCS_INTEGRATION === "1"

describe.skipIf(!run)("docs.nado.xyz integration (NADO_DOCS_INTEGRATION=1)", () => {
  it("loads sitemap URLs", async () => {
    const cfg = loadDocsRagConfig()
    const fetchOpts = {
      timeoutMs: cfg.timeoutMs,
      maxRetries: cfg.maxRetries,
      userAgent: "NadoLensDocsBot/1.0 (+vitest)",
    }
    const urls = await fetchAllSitemapPageUrls(
      cfg.baseUrl,
      cfg.baseUrl,
      fetchOpts,
    )
    expect(urls.length).toBeGreaterThan(3)
  })

  it("fetches robots.txt", async () => {
    const cfg = loadDocsRagConfig()
    const res = await fetchWithRetry(`${cfg.baseUrl}/robots.txt`, {
      timeoutMs: cfg.timeoutMs,
      maxRetries: 2,
      userAgent: "NadoLensDocsBot/1.0 (+vitest)",
    })
    expect(res.ok).toBe(true)
    const t = await res.text()
    expect(t.toLowerCase()).toContain("user-agent")
  })
})
