"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WalletStats } from "@/types/nado";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type Props = {
  stats: WalletStats;
}

export function WalletHeader({ stats }: Props) {
  const healthPct = Math.round(stats.health_score * 100);
  const healthColor =
    healthPct > 66
      ? "text-emerald-400"
      : healthPct > 33
        ? "text-orange-400"
        : "text-red-400";

  const addr = stats.address;
  const displayAddr =
    addr.length > 20 ? `${addr.slice(0, 10)}…${addr.slice(-8)}` : addr;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-1">
              Wallet
            </div>
            <div className="font-mono text-sm text-foreground break-all">
              {displayAddr}
            </div>
          </div>

          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                Equity
              </div>
              <div className="text-lg font-bold text-foreground tabular-nums">
                {fmtUsd.format(stats.total_equity_usd)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                Available
              </div>
              <div className="text-lg font-bold text-emerald-400 tabular-nums">
                {fmtUsd.format(stats.available_margin)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                Health
              </div>
              <div
                className={cn("text-lg font-bold tabular-nums", healthColor)}
              >
                {healthPct}%
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
