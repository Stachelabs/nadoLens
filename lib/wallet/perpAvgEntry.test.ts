import { describe, expect, it } from "vitest";
import { fromX18BigInt } from "@/types/nado";
import { perpAvgEntryUsdFromBalance } from "./perpAvgEntry";

const WAD = BigInt(10) ** BigInt(18);
const B0 = BigInt(0);

describe("perpAvgEntryUsdFromBalance", () => {
  it("matches float -v/a for small values", () => {
    const amount = (BigInt(-3207) * BigInt(10) ** BigInt(15)).toString();
    const vQuote = (BigInt(21671) * BigInt(10) ** BigInt(18)).toString();
    const mark = 66578;
    const got = perpAvgEntryUsdFromBalance(amount, vQuote, mark);
    const v = Number(vQuote) / 1e18;
    const a = Number(amount) / 1e18;
    const floatEntry = -v / a;
    expect(Math.abs(got - floatEntry) / floatEntry).toBeLessThan(1e-6);
  });

  it("does not collapse to mark for large x18 (precision vs naive float)", () => {
    const amount = (BigInt(-3207) * BigInt(10) ** BigInt(14)).toString();
    const vQuote = (BigInt(21671) * BigInt(10) ** BigInt(18)).toString();
    const mark = 66578;
    const got = perpAvgEntryUsdFromBalance(amount, vQuote, mark);
    expect(got).toBeGreaterThan(mark * 1.01);
  });

  it("abs(v)*WAD/abs(a) equals perpAvgEntryUsdFromBalance for opposite-sign perp", () => {
    const a = (BigInt(-33) * BigInt(10) ** BigInt(16)).toString();
    const v = (BigInt(2200) * BigInt(10) ** BigInt(18)).toString();
    const mark = 60_000;
    const av = BigInt(v);
    const aa = BigInt(a);
    const entryX18 =
      (av < B0 ? -av : av) * WAD / (aa < B0 ? -aa : aa);
    expect(perpAvgEntryUsdFromBalance(a, v, mark)).toBe(
      fromX18BigInt(entryX18.toString()),
    );
  });

  it("returns fallback when amount and v_quote have same sign", () => {
    const mark = 66_000;
    const badA = (BigInt(1) * BigInt(10) ** BigInt(18)).toString();
    const badV = (BigInt(1) * BigInt(10) ** BigInt(18)).toString();
    expect(perpAvgEntryUsdFromBalance(badA, badV, mark)).toBe(mark);
  });
});
