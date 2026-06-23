"use client";

import { Card } from "@/components/ui/card";
import {
  computeSimulation,
  FIXED_TOTAL,
  POOL_BREAKDOWN_FIXED,
  TOTAL_POINTS_POOL,
  useAirdropStore,
} from "@/store/airdropStore";
import { useMemo } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

type BreakdownEntry = { name: string; value: number; color: string };

function CustomTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
  total: number;
}) {
  if (!active || !payload?.[0]) return null;
  const { name, value, payload: p } = payload[0];
  const pct = ((value / total) * 100).toFixed(1);
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-sm font-medium" style={{ color: p.color }}>
        {name}
      </p>
      <p className="text-xs text-muted-foreground">
        {value.toLocaleString()} pts ({pct}%)
      </p>
    </div>
  );
}

export function AirdropPointsBreakdown() {
  const dailyVolumeM = useAirdropStore((s) => s.dailyVolumeM);
  const weeksOfFarm = useAirdropStore((s) => s.weeksOfFarm);
  const inkFdv = useAirdropStore((s) => s.inkFdv);
  const manualPoints = useAirdropStore((s) => s.manualPoints);
  const airdropPct = useAirdropStore((s) => s.airdropPct);

  const { entries, total } = useMemo(() => {
    const sim = computeSimulation({
      manualPoints,
      dailyVolumeM,
      weeksOfFarm,
      inkFdv,
      airdropPct,
    });
    const s2 = sim.estimatedS2Points;
    const dynamicTotal = FIXED_TOTAL + s2;
    const remaining = Math.max(0, TOTAL_POINTS_POOL - dynamicTotal);
    const allEntries: BreakdownEntry[] = [
      ...POOL_BREAKDOWN_FIXED.map((e) => ({ ...e })),
      { name: "S2 Projected", value: s2, color: "#60a5fa" },
      { name: "Remaining", value: remaining, color: "#4a5568" },
    ];
    return { entries: allEntries, total: dynamicTotal + remaining };
  }, [dailyVolumeM, weeksOfFarm, inkFdv, manualPoints, airdropPct]);

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Points Pool Breakdown
      </h2>
      <div className="mx-auto flex w-fit flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="h-[200px] w-[200px]">
          <PieChart width={200} height={200}>
            <Pie
              data={entries}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {entries.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip total={total} />} />
          </PieChart>
        </div>

        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div
                className="size-3 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-muted-foreground">
                {entry.name}
              </span>
              <span className="ml-auto text-xs font-medium text-foreground">
                {(entry.value / 1_000_000).toFixed(1)}M
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
            <span className="text-xs font-semibold text-foreground">Total</span>
            <span className="text-xs font-semibold text-foreground">
              {(total / 1_000_000).toFixed(1)}M
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
