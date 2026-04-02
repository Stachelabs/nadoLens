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
  subaccount = "0xsubA",
): TradeMatch {
  return {
    subaccount,
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
  it("position reversal: long 10 then sell 15 → net short 5 at reversal price", () => {
    const P68000 = BigInt(68000) * WAD;
    const long10 = (BigInt(10) * BigInt(10) ** BigInt(15)).toString();   // +0.010
    const sell15 = (-BigInt(15) * BigInt(10) ** BigInt(15)).toString();  // -0.015
    const target = (-BigInt(5) * BigInt(10) ** BigInt(15)).toString();   // -0.005 net short

    const trades = [
      tm("1", 2, long10, P67575.toString()),
      tm("2", 2, sell15, P68000.toString()),
    ];

    const out = replayPerpAvgEntryX18(trades, 2);
    expect(out).not.toBeNull();
    expect(out!.amountX18.toString()).toBe(target);
    expect(out!.avgEntryX18).toBe(P68000); // avg entry = reversal fill price

    const usd = perpAvgEntryUsdFromMatches(trades, 2, target);
    expect(usd).toBeCloseTo(68000, 1);
  });

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
        subaccount: "0xsubA",
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

  it("scopes VWAP by subaccount for same product", () => {
    const neg8m = (-BigInt(8) * BigInt(10) ** BigInt(15)).toString();
    const aPrice = (BigInt(66332) * WAD).toString();
    const bPrice = (BigInt(68000) * WAD).toString();
    const target = neg8m;
    const trades = [
      tm("1", 2, neg8m, aPrice, "0xaaa"),
      tm("2", 2, neg8m, bPrice, "0xbbb"),
    ];
    const positions = [
      {
        product_id: 2,
        pair: "BTC-PERP",
        subaccount: "0xaaa",
        amount_x18: target,
        amount: -0.008,
        entry_price: 99999,
        mark_price: 66000,
        unrealized_pnl: 0,
        liquidation_price: 0,
        margin_used: 0,
        maint_weight: 0.97,
        isolated: false,
      },
      {
        product_id: 2,
        pair: "BTC-PERP",
        subaccount: "0xbbb",
        amount_x18: target,
        amount: -0.008,
        entry_price: 99999,
        mark_price: 66000,
        unrealized_pnl: 0,
        liquidation_price: 0,
        margin_used: 0,
        maint_weight: 0.97,
        isolated: true,
      },
    ];
    const merged = mergePositionsWithVwapEntry(positions, trades);
    expect(merged[0]!.entry_price).toBeCloseTo(66332, 1);
    expect(merged[1]!.entry_price).toBeCloseTo(68000, 1);
  });

  it("prefers recent opening fills matching current amount", () => {
    const p66332 = (BigInt(66332) * WAD).toString();
    const p67049 = (BigInt(67049) * WAD).toString();
    const p67689 = (BigInt(67689) * WAD).toString();
    const open1 = "150000000000000"; // 0.00015
    const open2 = "400000000000000"; // 0.00040
    const closeOld = "-16050000000000000";
    const target = "550000000000000"; // 0.00055
    const trades: TradeMatch[] = [
      {
        ...tm("10", 2, open2, p67049, "0xaaa"),
        closed_amount: "0",
      },
      {
        ...tm("9", 2, open1, p66332, "0xaaa"),
        closed_amount: "0",
      },
      {
        ...tm("8", 2, closeOld, p67689, "0xaaa"),
        closed_amount: closeOld,
      },
    ];
    const usd = perpAvgEntryUsdFromMatches(trades, 2, target, "0xaaa");
    expect(usd).toBeCloseTo(66853.45, 2);
  });
});
