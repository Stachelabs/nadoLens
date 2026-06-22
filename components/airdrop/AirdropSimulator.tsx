"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  computeSimulation,
  SCENARIOS,
  useAirdropStore,
} from "@/store/airdropStore";
import { useMemo } from "react";

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
  return `${(n * 100).toFixed(6)}%`;
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
      <span className="text-xl font-bold text-foreground">{formatUsd(value)}</span>
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
  const setInkFdv = useAirdropStore((s) => s.setInkFdv);

  const sim = useMemo(
    () => computeSimulation({ manualPoints, dailyVolumeM, weeksOfFarm, inkFdv }),
    [manualPoints, dailyVolumeM, weeksOfFarm, inkFdv],
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Controls */}
        <Card className="space-y-5 p-5">
          {/* Points */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Your Points
            </Label>
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
            <div className="flex flex-wrap gap-1.5">
              {[100, 500, 1000, 2500, 5000, 10000, 20000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setManualPoints(v)}
                  className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  {v >= 1000 ? `${v / 1000}K` : v}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Protocol Daily Volume
              </Label>
              <span className="text-xs font-medium text-foreground">
                ${dailyVolumeM}M
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
                {weeksOfFarm}w
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
              <Label className="text-xs text-muted-foreground">
                $INK FDV
              </Label>
              <span className="text-xs font-medium text-foreground">
                ${(inkFdv / 1_000_000_000).toFixed(1)}B
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
        </Card>

        {/* Results */}
        <div className="space-y-3">
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

          <Card className="p-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              Simulation Details
            </h3>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Est. S2 Points (pool)</dt>
              <dd className="text-right font-medium text-foreground">
                {sim.estimatedS2Points.toLocaleString()}
              </dd>
              <dt className="text-muted-foreground">Total Pool (adjusted)</dt>
              <dd className="text-right font-medium text-foreground">
                {sim.totalPoolWithFarming.toLocaleString()}
              </dd>
              <dt className="text-muted-foreground">Your Share</dt>
              <dd className="text-right font-medium text-foreground">
                {formatPct(sim.shareOfPool)}
              </dd>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
