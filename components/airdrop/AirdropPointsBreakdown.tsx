"use client";

import { Card } from "@/components/ui/card";
import { POOL_BREAKDOWN, TOTAL_POINTS_POOL } from "@/store/airdropStore";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const data = POOL_BREAKDOWN.map((entry) => ({
  name: entry.name,
  value: entry.value,
  color: entry.color,
}));

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}) {
  if (!active || !payload?.[0]) return null;
  const { name, value, payload: p } = payload[0];
  const pct = ((value / TOTAL_POINTS_POOL) * 100).toFixed(1);
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
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Points Pool Breakdown
      </h2>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="h-[200px] w-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-2">
          {POOL_BREAKDOWN.map((entry) => (
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
          <div className="mt-1 border-t border-border pt-1">
            <span className="text-xs font-semibold text-foreground">
              Total: {(TOTAL_POINTS_POOL / 1_000_000).toFixed(1)}M
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
