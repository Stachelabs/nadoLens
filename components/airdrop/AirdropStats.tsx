"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAirdropStore } from "@/store/airdropStore";
import { Coins, TrendingUp, Layers } from "lucide-react";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-24" />
        ) : (
          <p className="truncate text-lg font-semibold text-foreground">
            {value}
          </p>
        )}
      </div>
    </Card>
  );
}

export function AirdropStats() {
  const data = useAirdropStore((s) => s.airdropData);
  const isLoading = useAirdropStore((s) => s.isLoading);
  const error = useAirdropStore((s) => s.error);
  const address = useAirdropStore((s) => s.address);

  if (!address) return null;

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    );
  }

  const inkDisplay = data?.inkAmount
    ? `${Number(data.inkAmount).toLocaleString()} INK`
    : "—";
  const volumeDisplay =
    data?.totalVolume !== null && data?.totalVolume !== undefined
      ? formatNumber(data.totalVolume)
      : "—";
  const productsCount = data?.volumeByProduct?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="INK Airdrop Allocation"
          value={inkDisplay}
          icon={Coins}
          loading={isLoading}
        />
        <StatCard
          label="Total Trading Volume"
          value={volumeDisplay}
          icon={TrendingUp}
          loading={isLoading}
        />
        <StatCard
          label="Products Traded"
          value={productsCount > 0 ? String(productsCount) : "—"}
          icon={Layers}
          loading={isLoading}
        />
      </div>

      {data?.volumeByProduct && data.volumeByProduct.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Volume by Product
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...data.volumeByProduct]
              .sort((a, b) => b.volume - a.volume)
              .slice(0, 12)
              .map((p) => (
                <div
                  key={p.productId}
                  className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                >
                  <span className="text-xs text-muted-foreground">
                    Product {p.productId}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {formatNumber(p.volume)}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
