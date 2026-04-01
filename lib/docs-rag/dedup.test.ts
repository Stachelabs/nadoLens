import { describe, expect, it } from "vitest"
import { dedupeUrls } from "./dedup"

describe("dedupeUrls", () => {
  it("sorts and dedupes", () => {
    expect(dedupeUrls(["b", "a", "a"])).toEqual(["a", "b"])
  })
})
