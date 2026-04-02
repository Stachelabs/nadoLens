import { describe, expect, it } from "vitest"
import { chunkMarkdown } from "./chunker"

describe("chunkMarkdown", () => {
  it("splits on headings", () => {
    const md = `# A\n\nx\n\n## B\n\ny\n`
    const chunks = chunkMarkdown(
      "https://docs.nado.xyz/t",
      md,
      "t",
      { maxChars: 10_000, minChars: 1 },
    )
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })
})
