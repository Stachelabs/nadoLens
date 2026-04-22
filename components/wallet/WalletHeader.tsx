"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import type { WalletStats } from "@/types/nado";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type Props = {
  stats: WalletStats;
};

export function WalletHeader({ stats }: Props) {
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
              <HoverCard>
                <HoverCardTrigger className="cursor-help">
                  <div className="flex items-center justify-end gap-1 text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                    Equity
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="top" align="end" className="w-56 text-xs">
                  <p className="font-medium text-foreground mb-1">Equity</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Total value of all spot assets + unrealized PnL from open
                    perp positions, across all cross subaccounts.
                  </p>
                </HoverCardContent>
              </HoverCard>
              <div className="text-lg font-bold text-foreground tabular-nums">
                {fmtUsd.format(stats.total_equity_usd)}
              </div>
            </div>

            <div className="text-right">
              <HoverCard>
                <HoverCardTrigger className="cursor-help">
                  <div className="flex items-center justify-end gap-1 text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                    Available
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="top" align="end" className="w-56 text-xs">
                  <p className="font-medium text-foreground mb-1">Available margin</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Equity minus initial margin used by open positions. The
                    amount free to open new trades.
                  </p>
                </HoverCardContent>
              </HoverCard>
              <div className="text-lg font-bold text-emerald-400 tabular-nums">
                {fmtUsd.format(stats.available_margin)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
