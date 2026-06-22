"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAirdropStore } from "@/store/airdropStore";
import { Award, Hash, Layers, Star, TrendingUp } from "lucide-react";
import { useEffect, useRef } from "react";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPoints(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div
        className={`flex size-10 items-center justify-center rounded-lg ${accent ? "bg-[#8b5cf6]/15" : "bg-primary/10"}`}
      >
        <Icon
          className={`size-5 ${accent ? "text-[#8b5cf6]" : "text-primary"}`}
        />
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

function EpochRow({
  description,
  points,
  rank,
  tierName,
}: {
  description: string;
  points: number;
  rank: number;
  tierName: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">{description}</span>
      <div className="flex items-center gap-3 text-xs">
        <span className="font-medium text-foreground">
          {formatPoints(points)} pts
        </span>
        <span className="text-muted-foreground">#{rank}</span>
        <span className="w-16 text-right text-muted-foreground">
          {tierName}
        </span>
      </div>
    </div>
  );
}

export function AirdropStats() {
  const data = useAirdropStore((s) => s.airdropData);
  const isLoading = useAirdropStore((s) => s.isLoading);
  const error = useAirdropStore((s) => s.error);
  const address = useAirdropStore((s) => s.address);
  const setManualPoints = useAirdropStore((s) => s.setManualPoints);
  const didPrefill = useRef(false);

  const pts = data?.points;
  const hasPoints = pts !== null && pts !== undefined;

  useEffect(() => {
    if (hasPoints && pts.allTimePoints > 0 && !didPrefill.current) {
      const currentPoints = Math.round(pts.allTimePoints);
      if (currentPoints > 0 && useAirdropStore.getState().manualPoints === 1000) {
        setManualPoints(currentPoints);
        didPrefill.current = true;
      }
    }
  }, [hasPoints, pts, setManualPoints]);

  if (!address) return null;

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    );
  }

  const volumeDisplay =
    data?.totalVolume !== null && data?.totalVolume !== undefined
      ? formatNumber(data.totalVolume)
      : "—";
  const productsCount = data?.volumeByProduct?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Points stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="All Time Points"
          value={hasPoints ? formatPoints(pts.allTimePoints) : "—"}
          icon={Star}
          loading={isLoading}
          accent
        />
        <StatCard
          label="All Time Rank"
          value={hasPoints && pts.allTimeRank > 0 ? `#${pts.allTimeRank}` : "—"}
          icon={Hash}
          loading={isLoading}
          accent
        />
        <StatCard
          label="Trader Tier"
          value={hasPoints ? pts.allTimeTierName : "—"}
          icon={Award}
          loading={isLoading}
          accent
        />
        <StatCard
          label="Total Trading Volume"
          value={volumeDisplay}
          icon={TrendingUp}
          loading={isLoading}
        />
      </div>

      {/* Distribution history */}
      {hasPoints && pts.epochs.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Distribution History
          </h3>
          <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
            {[...pts.epochs].reverse().map((e) => (
              <EpochRow
                key={e.epoch}
                description={e.description}
                points={e.points}
                rank={e.rank}
                tierName={e.tierName}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Volume by product */}
      {data?.volumeByProduct && data.volumeByProduct.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Volume by Product
            </h3>
            <span className="text-xs text-muted-foreground">
              <Layers className="mr-1 inline size-3" />
              {productsCount} products
            </span>
          </div>
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
