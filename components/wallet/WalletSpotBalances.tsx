"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SpotBalance, SpotBalancesGroup } from "@/types/nado";

type Props = {
  bySubaccount: SpotBalancesGroup[];
  /** Aggregate across subs — used only if `bySubaccount` is empty. */
  mergedBalances: SpotBalance[];
};

const SPOT_ASSETS = [
  { product_id: 0, symbol: "USDT0", icon: "/icons/spot/usdt0.svg" },
  { product_id: 1, symbol: "KBTC", icon: "/icons/spot/kbtc.svg" },
  { product_id: 3, symbol: "WETH", icon: "/icons/spot/weth.svg" },
  { product_id: 5, symbol: "USDC", icon: "/icons/spot/usdc.svg" },
  { product_id: 11, symbol: "NLP", icon: "/icons/spot/nlp.svg" },
];

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  const decimals = abs === 0 ? 2 : abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function WalletSpotBalances({
  bySubaccount,
  mergedBalances,
}: Props) {
  const groups = useMemo<SpotBalancesGroup[]>(() => {
    if (bySubaccount.length > 0) return bySubaccount;
    return [
      {
        label: "main",
        subaccount: "",
        balances: mergedBalances,
      },
    ];
  }, [bySubaccount, mergedBalances]);

  const [selectedLabel, setSelectedLabel] = useState<string>("main");

  useEffect(() => {
    const labels = groups.map((g) => g.label);
    setSelectedLabel((prev) => {
      if (labels.includes(prev)) return prev;
      if (labels.includes("main")) return "main";
      return labels[0] ?? "main";
    });
  }, [groups]);

  const balances = useMemo(() => {
    const g =
      groups.find((x) => x.label === selectedLabel) ?? groups[0] ?? null;
    return g?.balances ?? [];
  }, [groups, selectedLabel]);

  const byId = new Map(balances.map((b) => [b.product_id, b]));

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Spot Balances
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {groups.map((g) => {
              const isSelected = g.label === selectedLabel;
              return (
                <button
                  key={g.subaccount + g.label}
                  type="button"
                  className={cn(
                    badgeVariants({
                      variant: isSelected ? "secondary" : "ghost",
                    }),
                    "h-6 cursor-pointer px-2.5 text-[11px] font-medium transition-colors",
                    !isSelected && "text-muted-foreground",
                  )}
                  onClick={() => setSelectedLabel(g.label)}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SPOT_ASSETS.map((asset) => {
            const balance = byId.get(asset.product_id);
            const amount = balance?.amount ?? 0;
            const valueUsd = balance?.value_usd ?? 0;
            const negative = amount < 0;

            return (
              <div
                key={asset.product_id}
                className="flex items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2"
              >
                <Image
                  src={asset.icon}
                  alt={asset.symbol}
                  width={20}
                  height={20}
                  className="shrink-0 rounded-full"
                />
                <span className="text-sm font-semibold text-foreground">
                  {asset.symbol}
                </span>
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    negative ? "text-red-400" : "text-foreground",
                  )}
                >
                  {formatAmount(amount)}
                </span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    negative ? "text-red-400" : "text-muted-foreground",
                  )}
                >
                  {fmtUsd.format(valueUsd)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
