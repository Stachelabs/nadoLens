"use client";

import { AccountFilterSelect } from "@/components/wallet/AccountFilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SpotBalance, SpotBalancesGroup } from "@/types/nado";
import { RefreshCw } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

type Props = {
  bySubaccount: SpotBalancesGroup[];
  /** Aggregate across subs — used only if `bySubaccount` is empty. */
  mergedBalances: SpotBalance[];
  /** Re-fetch Gateway subaccount_info for all cross subs (spot + positions). */
  onRefreshSpotBalances?: () => void | Promise<void>;
  spotBalancesRefreshing?: boolean;
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

const ALL_LABEL = "All";

export function WalletSpotBalances({
  bySubaccount,
  mergedBalances,
  onRefreshSpotBalances,
  spotBalancesRefreshing = false,
}: Props) {
  const groups = useMemo<SpotBalancesGroup[]>(() => {
    const allGroup: SpotBalancesGroup = {
      label: ALL_LABEL,
      subaccount: "",
      balances: mergedBalances,
    };
    return [allGroup, ...bySubaccount];
  }, [bySubaccount, mergedBalances]);

  const [selectedLabel, setSelectedLabel] = useState<string>(ALL_LABEL);

  const displayLabel = useMemo(() => {
    const labels = groups.map((g) => g.label);
    if (labels.includes(selectedLabel)) return selectedLabel;
    if (labels.includes(ALL_LABEL)) return ALL_LABEL;
    return labels[0] ?? ALL_LABEL;
  }, [groups, selectedLabel]);

  const balances = useMemo(() => {
    const g = groups.find((x) => x.label === displayLabel) ?? groups[0] ?? null;
    return g?.balances ?? [];
  }, [groups, displayLabel]);

  const accountOptions = useMemo(() => groups.map((g) => g.label), [groups]);

  const byId = new Map(balances.map((b) => [b.product_id, b]));

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap  items-center gap-2 min-h-6">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Spot Balances
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AccountFilterSelect
              options={accountOptions}
              value={displayLabel}
              onValueChange={setSelectedLabel}
            />
            {onRefreshSpotBalances ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                disabled={spotBalancesRefreshing}
                onClick={() => void onRefreshSpotBalances()}
                aria-label="Refresh spot balances from Gateway"
              >
                <RefreshCw
                  className={cn(
                    "size-3",
                    spotBalancesRefreshing && "animate-spin",
                  )}
                  aria-hidden
                />
              </Button>
            ) : null}
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
                className="flex items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2 min-w-[234px]"
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
                    negative ? "text-[var(--bear)]" : "text-foreground",
                  )}
                >
                  {formatAmount(amount)}
                </span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    negative ? "text-[var(--bear)]" : "text-muted-foreground",
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
