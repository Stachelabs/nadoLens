import { describe, expect, it } from "vitest"
import { parseSitemapXml } from "./sitemap"

describe("parseSitemapXml", () => {
  it("parses loc tags", () => {
    const xml = `<?xml version="1.0"?><urlset><loc>https://docs.nado.xyz/a</loc><loc>https://docs.nado.xyz/b</loc></urlset>`
    const urls = parseSitemapXml(
      xml,
      "https://docs.nado.xyz",
      "https://docs.nado.xyz/sitemap.xml",
    )
    expect(urls).toEqual([
      "https://docs.nado.xyz/a",
      "https://docs.nado.xyz/b",
    ])
  })
})
