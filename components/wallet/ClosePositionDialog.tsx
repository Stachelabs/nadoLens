"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Position } from "@/types/nado";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const fmtQty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

const QUICK_PCTS = [25, 50, 75, 100] as const;

function pairSymbol(pair: string): string {
  return pair.split("-")[0] ?? pair;
}

type Props = {
  position: Position | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: {
    productId: number;
    amountX18: string;
    subaccountName: string;
    pair: string;
    isLong: boolean;
    isolated: boolean;
  }) => void;
  isClosing?: boolean;
};

export function ClosePositionDialog({
  position,
  open,
  onOpenChange,
  onConfirm,
  isClosing = false,
}: Props) {
  const [pct, setPct] = useState(100);

  useEffect(() => {
    if (open) setPct(100);
  }, [open]);

  if (!position) return null;

  const isLong = position.amount >= 0;
  const absAmount = Math.abs(position.amount);
  const closeAmount = absAmount * (pct / 100);
  const symbol = pairSymbol(position.pair);
  const proportionalPnl = position.unrealized_pnl * (pct / 100);

  const rawX18 = BigInt(position.amount_x18);
  const absX18 = rawX18 < BigInt(0) ? -rawX18 : rawX18;
  const closeX18 = (absX18 * BigInt(pct)) / BigInt(100);
  const signedCloseX18 = isLong ? -closeX18 : closeX18;

  const subaccountName = position.isolated
    ? (position.parent_subaccount_name ?? "default")
    : (position.subaccount_name ?? "default");

  function handleConfirm() {
    if (!position) return;
    onConfirm({
      productId: position.product_id,
      amountX18: signedCloseX18.toString(),
      subaccountName,
      pair: position.pair,
      isLong,
      isolated: position.isolated,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isClosing) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isClosing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Close {position.pair}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 font-bold",
                isLong
                  ? "text-primary border-primary/30 bg-primary/10"
                  : "text-destructive border-destructive/30 bg-destructive/10",
              )}
            >
              {isLong ? "LONG" : "SHORT"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Position summary */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="text-muted-foreground">Size</div>
            <div className="text-right font-mono tabular-nums text-foreground">
              {fmtQty.format(absAmount)} {symbol}
            </div>
            {position.entry_price != null && (
              <>
                <div className="text-muted-foreground">Entry Price</div>
                <div className="text-right font-mono tabular-nums text-foreground">
                  {fmtUsd.format(position.entry_price)}
                </div>
              </>
            )}
            <div className="text-muted-foreground">Mark Price</div>
            <div className="text-right font-mono tabular-nums text-foreground">
              {fmtUsd.format(position.mark_price)}
            </div>
            <div className="text-muted-foreground">Unrealized PnL</div>
            <div
              className={cn(
                "text-right font-mono tabular-nums",
                position.unrealized_pnl >= 0
                  ? "text-primary"
                  : "text-destructive",
              )}
            >
              {position.unrealized_pnl >= 0 ? "+" : ""}
              {fmtUsd.format(position.unrealized_pnl)}
            </div>
          </div>

          {/* Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Close Amount</span>
              <span className="font-mono tabular-nums text-foreground">
                {pct}%
              </span>
            </div>
            <Slider
              value={[pct]}
              onValueChange={(v) => setPct(Array.isArray(v) ? v[0] : v)}
              min={1}
              max={100}
              step={1}
            />
            <div className="flex gap-1.5">
              {QUICK_PCTS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={pct === p ? "default" : "outline"}
                  size="sm"
                  className="h-6 flex-1 text-[10px] px-0"
                  onClick={() => setPct(p)}
                >
                  {p}%
                </Button>
              ))}
            </div>
          </div>

          {/* Close preview */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Closing</span>
              <span className="font-mono tabular-nums text-foreground">
                {fmtQty.format(closeAmount)} {symbol}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Est. PnL</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  proportionalPnl >= 0 ? "text-primary" : "text-destructive",
                )}
              >
                {proportionalPnl >= 0 ? "+" : ""}
                {fmtUsd.format(proportionalPnl)}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground/70">
              Market order · Reduce only · {isLong ? "Sell" : "Buy"} to close
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose disabled={isClosing}>
            <Button type="button" variant="outline" disabled={isClosing}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isClosing || pct === 0 || closeX18 === BigInt(0)}
          >
            {isClosing ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                Closing…
              </>
            ) : (
              "Close Position"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
