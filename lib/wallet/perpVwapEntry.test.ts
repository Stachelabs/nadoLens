import { describe, expect, it } from "vitest";
import type { TradeMatch } from "@/types/nado";
import {
  mergePositionsWithVwapEntry,
  perpAvgEntryUsdFromMatches,
  replayPerpAvgEntryX18,
} from "./perpVwapEntry";

const WAD = BigInt(10) ** BigInt(18);
const P67575 = BigInt(67575) * WAD;

function tm(
  idx: string,
  productId: number,
  baseX18: string,
  priceX18: string,
): TradeMatch {
  return {
    timestamp: "0",
    submission_idx: idx,
    product_id: productId,
    pair: "BTC-PERP",
    amount: baseX18,
    price: priceX18,
    quote_filled: "0",
    realized_pnl: "0",
    closed_amount: "0",
    fee: "0",
    sequencer_fee: "0",
    side: "short",
    is_perp: true,
  };
}

describe("replayPerpAvgEntryX18", () => {
  it("two adds at same price keep that VWAP", () => {
    const neg8m = (-BigInt(8) * BigInt(10) ** BigInt(15)).toString();
    const trades = [
      tm("1", 2, neg8m, P67575.toString()),
      tm("2", 2, neg8m, P67575.toString()),
    ];
    const out = replayPerpAvgEntryX18(trades, 2);
    expect(out).not.toBeNull();
    expect(out!.amountX18.toString()).toBe(
      (-BigInt(16) * BigInt(10) ** BigInt(15)).toString(),
    );
    expect(out!.avgEntryX18).toBe(P67575);
  });

  it("perpAvgEntryUsdFromMatches matches gateway amount", () => {
    const neg8m = (-BigInt(8) * BigInt(10) ** BigInt(15)).toString();
    const target = (-BigInt(16) * BigInt(10) ** BigInt(15)).toString();
    const trades = [
      tm("1", 2, neg8m, P67575.toString()),
      tm("2", 2, neg8m, P67575.toString()),
    ];
    const usd = perpAvgEntryUsdFromMatches(trades, 2, target);
    expect(usd).toBeCloseTo(67575, 1);
  });
});

describe("mergePositionsWithVwapEntry", () => {
  it("overrides entry_price when VWAP resolves", () => {
    const neg8m = (-BigInt(8) * BigInt(10) ** BigInt(15)).toString();
    const target = (-BigInt(16) * BigInt(10) ** BigInt(15)).toString();
    const trades = [
      tm("1", 2, neg8m, P67575.toString()),
      tm("2", 2, neg8m, P67575.toString()),
    ];
    const positions = [
      {
        product_id: 2,
        pair: "BTC-PERP",
        subaccount: "0x",
        amount_x18: target,
        amount: -0.016,
        entry_price: 99999,
        mark_price: 66000,
        unrealized_pnl: 0,
        liquidation_price: 0,
        margin_used: 0,
        maint_weight: 0.97,
        isolated: false,
      },
    ];
    const merged = mergePositionsWithVwapEntry(positions, trades);
    expect(merged[0]!.entry_price).toBeCloseTo(67575, 1);
  });
});
