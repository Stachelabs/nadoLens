"use client";

import { TradeOnNadoButton } from "@/components/TradeOnNadoButton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { computeSimulation, useAirdropStore } from "@/store/airdropStore";
import { useMemo } from "react";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function sliderVal(v: number | readonly number[]): number {
  if (Array.isArray(v)) return v[0];
  if (typeof v === "number") return v;
  return 0;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

function buildShareUrl(airdropValue: number): string {
  const value = formatUsd(airdropValue);
  const text = `My $INK airdrop could be worth ${value} thanks to my @nadoHQ activity 🌪️\n\nSimulated with NadoLens 🔍🫟 \n\nCheck yours 👇\nnadolens.xyz/airdrop`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function ScenarioCard({
  label,
  pct,
  color,
  value,
  dollarPerPoint,
}: {
  label: string;
  pct: number;
  color: string;
  value: number;
  dollarPerPoint: number;
}) {
  return (
    <Card className="flex flex-col items-center gap-1 p-4 text-center">
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {label} ({(pct * 100).toFixed(1)}%)
      </span>
      <span className="text-xl font-bold text-foreground">
        {formatUsd(value)}
      </span>
      <span className="text-[11px] text-muted-foreground">
        ${dollarPerPoint.toFixed(4)} / point
      </span>
    </Card>
  );
}

export function AirdropSimulator() {
  const manualPoints = useAirdropStore((s) => s.manualPoints);
  const dailyVolumeM = useAirdropStore((s) => s.dailyVolumeM);
  const weeksOfFarm = useAirdropStore((s) => s.weeksOfFarm);
  const inkFdv = useAirdropStore((s) => s.inkFdv);
  const setManualPoints = useAirdropStore((s) => s.setManualPoints);
  const setDailyVolumeM = useAirdropStore((s) => s.setDailyVolumeM);
  const setWeeksOfFarm = useAirdropStore((s) => s.setWeeksOfFarm);
  const airdropPct = useAirdropStore((s) => s.airdropPct);
  const setInkFdv = useAirdropStore((s) => s.setInkFdv);
  const setAirdropPct = useAirdropStore((s) => s.setAirdropPct);

  const sim = useMemo(
    () =>
      computeSimulation({
        manualPoints,
        dailyVolumeM,
        weeksOfFarm,
        inkFdv,
        airdropPct,
      }),
    [manualPoints, dailyVolumeM, weeksOfFarm, inkFdv, airdropPct],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Airdrop Simulator
        </h2>
        <span className="text-xs text-muted-foreground">
          Your share: {formatPct(sim.shareOfPool)}
        </span>
      </div>

      <Card className="space-y-5 p-5 **:data-[slot=slider-range]:bg-airdrop">
        {/* Points */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Your Points</Label>
          <Input
            type="number"
            min={0}
            max={10_000_000}
            value={manualPoints}
            onChange={(e) =>
              setManualPoints(Math.max(0, Number(e.target.value)))
            }
            className="font-mono"
          />
        </div>

        {/* Daily Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Protocol Daily Volume
            </Label>
            <span className="text-xs font-medium text-foreground">
              ${dailyVolumeM} M
            </span>
          </div>
          <Slider
            value={[dailyVolumeM]}
            onValueChange={(v) => setDailyVolumeM(sliderVal(v))}
            min={0}
            max={2000}
            step={50}
          />
          <p className="text-[11px] text-muted-foreground">
            Weekly pool: ~{sim.weeklyPts.toLocaleString()} pts
          </p>
        </div>

        {/* Weeks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Weeks of Farming
            </Label>
            <span className="text-xs font-medium text-foreground">
              {weeksOfFarm} W
            </span>
          </div>
          <Slider
            value={[weeksOfFarm]}
            onValueChange={(v) => setWeeksOfFarm(sliderVal(v))}
            min={1}
            max={52}
            step={1}
          />
        </div>

        {/* FDV */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">$INK FDV</Label>
            <span className="text-xs font-medium text-foreground">
              ${(inkFdv / 1_000_000_000).toFixed(1)} B
            </span>
          </div>
          <Slider
            value={[inkFdv]}
            onValueChange={(v) => setInkFdv(sliderVal(v))}
            min={500_000_000}
            max={10_000_000_000}
            step={100_000_000}
          />
        </div>

        {/* Airdrop Allocation % */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Airdrop Allocation (% of $INK Supply)
            </Label>
            <span className="text-xs font-medium text-foreground">
              {airdropPct}%
            </span>
          </div>
          <Slider
            value={[airdropPct]}
            onValueChange={(v) => setAirdropPct(sliderVal(v))}
            min={0}
            max={25}
            step={0.5}
          />
        </div>
        <div className="mt-5 flex flex-col items-center gap-2 rounded-lg bg-muted/50 px-4 py-4">
          <span className="text-xs text-muted-foreground">
            Estimated Airdrop Value
          </span>
          <span className="text-2xl font-bold text-primary">
            {formatUsd(sim.airdropValue)}
          </span>
          <span className="text-xs text-muted-foreground">
            ${sim.dollarPerPoint.toFixed(4)} / point
          </span>
          <div className="mt-1 flex items-center gap-2">
            <a
              href={buildShareUrl(sim.airdropValue)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-80"
            >
              Share on <XIcon className="size-3" />
            </a>
            <TradeOnNadoButton />
          </div>
        </div>

        {/* Scenarios */}
        <div>
          <h3 className="text-center text-xs font-medium text-muted-foreground sm:text-left mb-2">
            Projected $INK Airdrop Allocation
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {sim.scenarios.map((s) => (
              <ScenarioCard
                key={s.key}
                label={s.label}
                pct={s.pct}
                color={s.color}
                value={s.airdropValue}
                dollarPerPoint={s.dollarPerPoint}
              />
            ))}
          </div>
        </div>

        {/* Simulation Details */}
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Simulation Details
          </h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto]">
            <dt className="text-muted-foreground">Est. S2 Points (pool)</dt>
            <dd className="text-right font-medium text-foreground sm:pr-6">
              {formatCompact(sim.estimatedS2Points)}
            </dd>
            <dt className="text-muted-foreground">Total Pool (adjusted)</dt>
            <dd className="text-right font-medium text-foreground sm:pr-6">
              {formatCompact(sim.totalPoolWithFarming)}
            </dd>
            <dt className="text-muted-foreground">Your Share</dt>
            <dd className="text-right font-medium text-foreground">
              {formatPct(sim.shareOfPool)}
            </dd>
          </dl>
        </div>
      </Card>
    </div>
  );
}
