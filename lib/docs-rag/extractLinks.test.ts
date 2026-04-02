import { describe, expect, it } from "vitest"
import {
  extractInternalLinkUrls,
  extractNavLinkUrls,
} from "./extractLinks"

const html = `
<html><body>
<nav><a href="/developer-resources">Dev</a></nav>
<aside><a href="/sdks/python-sdk">Py</a></aside>
<main>
<a href="https://docs.nado.xyz/overview">Same</a>
<a href="https://example.com/x">Ext</a>
<a href="mailto:a@b.c">M</a>
</main>
</body></html>
`

describe("extractInternalLinkUrls", () => {
  it("collects same-origin links only", () => {
    const base = "https://docs.nado.xyz"
    const page = `${base}/overview`
    const urls = extractInternalLinkUrls(html, page, base)
    expect(urls).toContain(`${base}/developer-resources`)
    expect(urls).toContain(`${base}/sdks/python-sdk`)
    expect(urls).toContain(`${base}/overview`)
    expect(urls.some((u) => u.includes("example.com"))).toBe(false)
  })
})

describe("extractNavLinkUrls", () => {
  it("reads nav and aside", () => {
    const base = "https://docs.nado.xyz"
    const page = `${base}/`
    const urls = extractNavLinkUrls(html, page, base)
    expect(urls.length).toBeGreaterThanOrEqual(2)
  })
})
