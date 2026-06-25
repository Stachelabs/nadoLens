"use client";

import { Card } from "@/components/ui/card";
import {
  computeActualS2FromEpochs,
  computeSimulation,
  countS2EpochsElapsed,
  POOL_BREAKDOWN_FIXED,
  useAirdropStore,
} from "@/store/airdropStore";
import { useEffect, useMemo, useState } from "react";
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
        {value.toLocaleString("en-US")} pts ({pct}%)
      </p>
    </div>
  );
}

export function AirdropPointsBreakdown() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dailyVolumeM = useAirdropStore((s) => s.dailyVolumeM);
  const weeksOfFarm = useAirdropStore((s) => s.weeksOfFarm);
  const inkFdv = useAirdropStore((s) => s.inkFdv);
  const manualPoints = useAirdropStore((s) => s.manualPoints);
  const airdropPct = useAirdropStore((s) => s.airdropPct);
  const epochs = useAirdropStore((s) => s.airdropData?.points?.epochs);

  const { entries, total } = useMemo(() => {
    const actualS2 = epochs ? computeActualS2FromEpochs(epochs) : undefined;
    const s2Elapsed = epochs ? countS2EpochsElapsed(epochs) : undefined;

    const sim = computeSimulation({
      manualPoints,
      dailyVolumeM,
      weeksOfFarm,
      inkFdv,
      airdropPct,
      actualS2Distributed: actualS2,
      s2EpochsElapsed: s2Elapsed,
    });

    const allEntries: BreakdownEntry[] = [
      ...POOL_BREAKDOWN_FIXED.map((e) => ({ ...e })),
    ];

    if (sim.actualS2Distributed !== undefined && sim.projectedRemaining !== undefined) {
      allEntries.push(
        { name: "S2 Distributed", value: sim.actualS2Distributed, color: "#818cf8" },
        { name: "S2 Remaining", value: sim.projectedRemaining, color: "#60a5fa" },
      );
    } else {
      allEntries.push(
        { name: "S2 Estimated", value: sim.estimatedS2Points, color: "#60a5fa" },
      );
    }

    const dynamicTotal = allEntries.reduce((s, e) => s + e.value, 0);
    return { entries: allEntries, total: dynamicTotal };
  }, [dailyVolumeM, weeksOfFarm, inkFdv, manualPoints, airdropPct, epochs]);

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Points Pool Breakdown
      </h2>
      <div className="mx-auto flex w-fit flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="h-[200px] w-[200px]">
          {mounted && (
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
          )}
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
