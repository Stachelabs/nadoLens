"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type EpochData, useAirdropStore } from "@/store/airdropStore";
import { productName } from "@/store/pairsStore";
import { perpIconSrcFromPair } from "@/lib/wallet/perpPairIcon";
import {
  Award,
  ChevronDown,
  Clock,
  Hash,
  Layers,
  Star,
  TrendingUp,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
    <Card className="flex flex-col items-center gap-2 p-4 text-center">
      <div
        className={accent ? "flex size-10 items-center justify-center rounded-lg bg-airdrop/15" : "flex size-10 items-center justify-center rounded-lg bg-primary/10"}
      >
        <Icon
          className={accent ? "size-5 text-airdrop" : "size-5 text-primary"}
        />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <p className="text-xl font-semibold text-foreground">{value}</p>
      )}
    </Card>
  );
}

function splitEpochLabel(description: string): { line1: string; line2: string } {
  const parts = description.split(" ");
  if (parts.length >= 2) return { line1: parts[0], line2: parts.slice(1).join(" ") };
  return { line1: description, line2: "" };
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
  const label = splitEpochLabel(description);
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
      <span className="w-14 shrink-0 text-center text-xs text-muted-foreground sm:w-auto sm:text-left">
        <span className="sm:hidden flex flex-col leading-tight">
          <span>{label.line1}</span>
          <span>{label.line2}</span>
        </span>
        <span className="hidden sm:inline">{description}</span>
      </span>
      <div className="flex flex-1 items-center justify-end gap-2 text-xs sm:gap-6">
        <span className="flex-1 text-right font-medium text-foreground sm:w-20 sm:flex-none">
          {formatPoints(points)} pts
        </span>
        <span className="flex-1 text-right text-muted-foreground sm:w-16 sm:flex-none">
          #{rank}
        </span>
        <span className="flex-1 text-right text-muted-foreground sm:w-20 sm:flex-none sm:text-center">
          {tierName}
        </span>
      </div>
    </div>
  );
}

function resolveIconSrc(symbol: string): string | null {
  const perpSrc = perpIconSrcFromPair(symbol);
  if (perpSrc) return perpSrc;
  const lower = symbol.toLowerCase();
  return `/icons/spot/${lower}.svg`;
}

function TokenIcon({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  const iconSrc = resolveIconSrc(symbol);
  if (failed || !iconSrc) {
    return <div className="size-4 shrink-0 rounded-full bg-airdrop" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic src with onError fallback
    <img
      src={iconSrc}
      alt={symbol.replace("-PERP", "")}
      width={16}
      height={16}
      className="shrink-0 rounded-full"
      onError={() => setFailed(true)}
    />
  );
}

function EpochCountdown({ latestEndTime }: { latestEndTime: number }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const nextEnd = (latestEndTime + 604800) * 1000;
    const tick = () => {
      const diff = nextEnd - Date.now();
      if (diff <= 0) {
        setRemaining("Epoch ended");
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [latestEndTime]);

  return (
    <span className="text-xs font-medium text-foreground">
      {remaining}
    </span>
  );
}

function DistributionList({ epochs }: { epochs: EpochData[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () =>
      setCanScroll(
        el.scrollHeight > el.clientHeight &&
          el.scrollTop + el.clientHeight < el.scrollHeight - 4,
      );
    check();
    el.addEventListener("scroll", check);
    return () => el.removeEventListener("scroll", check);
  }, [epochs]);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto"
      >
        {[...epochs].reverse().map((e) => (
          <EpochRow
            key={e.epoch}
            description={e.description}
            points={e.points}
            rank={e.rank}
            tierName={e.tierName}
          />
        ))}
      </div>
      {canScroll && (
        <div className="flex items-center justify-center pt-2">
          <ChevronDown className="size-4 animate-bounce text-muted-foreground" />
        </div>
      )}
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
      if (
        currentPoints > 0 &&
        useAirdropStore.getState().manualPoints === 1000
      ) {
        setManualPoints(currentPoints);
        didPrefill.current = true;
      }
    }
  }, [hasPoints, pts, setManualPoints]);

  const idle = !address && !isLoading;

  const volumeDisplay =
    data?.totalVolume !== null && data?.totalVolume !== undefined
      ? formatNumber(data.totalVolume)
      : "—";
  const productsCount = data?.volumeByProduct?.length ?? 0;

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}
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
          accent
        />
      </div>

      {/* Distribution history skeleton */}
      {isLoading && (
        <Card className="space-y-3 p-4">
          <Skeleton className="h-4 w-40" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </Card>
      )}

      {/* Distribution history */}
      {!isLoading && hasPoints && pts.epochs.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Distribution History
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
              <Clock className="size-3" />
              <span>Next epoch in</span>
              <EpochCountdown latestEndTime={[...pts.epochs].sort((a, b) => b.endTime - a.endTime)[0].endTime} />
            </div>
          </div>
          <div className="mb-2 flex items-center justify-between px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <div className="w-14 shrink-0 text-center sm:flex sm:w-auto sm:items-center sm:gap-3 sm:text-left">
              <span>Epoch</span>
              <span className="hidden sm:inline-flex sm:items-center sm:gap-1.5 text-muted-foreground font-normal normal-case tracking-normal">
                <Clock className="size-3" />
                <span className="text-xs">Next epoch in</span>
                <EpochCountdown latestEndTime={[...pts.epochs].sort((a, b) => b.endTime - a.endTime)[0].endTime} />
              </span>
            </div>
            <div className="flex flex-1 items-center justify-end gap-2 sm:gap-6">
              <span className="flex-1 text-right sm:w-20 sm:flex-none">Points</span>
              <span className="flex-1 text-right sm:w-16 sm:flex-none">Rank</span>
              <span className="flex-1 text-right sm:w-20 sm:flex-none sm:text-center">Tier</span>
            </div>
          </div>
          <DistributionList epochs={pts.epochs} />
          <div className="mt-3 flex items-center border-t border-border px-3 pt-3">
            <span className="w-14 shrink-0 text-center text-xs font-semibold text-foreground sm:w-auto sm:text-left">
              All Time
            </span>
            <div className="flex flex-1 items-center justify-end gap-2 text-xs sm:gap-6">
              <span className="flex-1 text-right font-semibold text-foreground sm:w-20 sm:flex-none">
                {formatPoints(pts.allTimePoints)} pts
              </span>
              <span className="flex-1 text-right font-semibold text-foreground sm:w-16 sm:flex-none">
                #{pts.allTimeRank}
              </span>
              <span className="flex-1 text-right font-semibold text-foreground sm:w-20 sm:flex-none sm:text-center">
                {pts.allTimeTierName}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Volume by product skeleton */}
      {isLoading && (
        <Card className="space-y-3 p-4">
          <Skeleton className="h-4 w-36" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </Card>
      )}

      {/* Volume by product */}
      {!isLoading && data?.volumeByProduct && data.volumeByProduct.length > 0 && (
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
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TokenIcon symbol={productName(p.productId)} />
                    {productName(p.productId)}
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
