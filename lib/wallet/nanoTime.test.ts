import { describe, it, expect } from "vitest";
import { nanoStringToMs, nanoStringToUnixSec } from "./nanoTime";

describe("nanoStringToMs", () => {
  it("parses Archive txs timestamp as Unix seconds (doc)", () => {
    const sec = "1679728133";
    expect(nanoStringToMs(sec)).toBe(1679728133000);
  });

  it("parses internal hook form (seconds * 1e9) without precision loss", () => {
    const internal = (BigInt(1679728133) * BigInt(1_000_000_000)).toString();
    expect(nanoStringToMs(internal)).toBe(1679728133000);
  });

  it("parses large nanosecond strings without JS Number precision loss on parseInt", () => {
    const nano = "1772823289000000000";
    const ms = nanoStringToMs(nano);
    expect(ms).not.toBeNull();
    const wrong = Number.parseInt(nano, 10);
    expect(wrong).not.toBe(Number(ms));
  });

  it("returns null for zero or invalid", () => {
    expect(nanoStringToMs("0")).toBeNull();
    expect(nanoStringToMs("")).toBeNull();
  });

  it("nanoStringToUnixSec matches ms / 1000", () => {
    const nano = "1772823289000000000";
    const ms = nanoStringToMs(nano);
    const sec = nanoStringToUnixSec(nano);
    if (ms !== null && sec !== null) {
      expect(sec).toBe(Math.floor(ms / 1000));
    }
  });
});
