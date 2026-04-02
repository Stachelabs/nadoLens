import { describe, expect, it } from "vitest"
import { isUrlAllowedByRobots, parseRobotsTxt } from "./robots"

describe("robots", () => {
  it("parses disallow prefixes", () => {
    const rules = parseRobotsTxt(`User-agent: *\nDisallow: /secret\n`)
    expect(isUrlAllowedByRobots("https://docs.nado.xyz/secret/a", rules).allowed).toBe(
      false,
    )
    expect(isUrlAllowedByRobots("https://docs.nado.xyz/public", rules).allowed).toBe(
      true,
    )
  })
})
