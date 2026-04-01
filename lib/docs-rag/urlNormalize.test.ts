import { describe, expect, it } from "vitest"
import { normalizeInternalUrl, safeMarkdownFilename } from "./urlNormalize"

describe("normalizeInternalUrl", () => {
  const origin = "https://docs.nado.xyz"

  it("strips hash and query", () => {
    expect(
      normalizeInternalUrl(
        origin,
        "/api/foo?q=1#x",
        `${origin}/overview`,
      ),
    ).toBe(`${origin}/api/foo`)
  })

  it("drops external origins", () => {
    expect(
      normalizeInternalUrl(origin, "https://evil.com/x", `${origin}/`),
    ).toBeNull()
  })

  it("normalizes trailing slash", () => {
    const a = normalizeInternalUrl(origin, "/path/", `${origin}/x`)
    const b = normalizeInternalUrl(origin, "/path", `${origin}/x`)
    expect(a).toBe(b)
  })
})

describe("safeMarkdownFilename", () => {
  it("produces stable filename", () => {
    expect(safeMarkdownFilename("https://docs.nado.xyz/a/b")).toMatch(/\.md$/)
  })
})
