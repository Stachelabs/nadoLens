"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useProtocolMarketSnapshots } from "@/hooks/useProtocolMarketSnapshots";
import { fromX18BigInt } from "@/types/nado";
import { Skeleton } from "@/components/ui/skeleton";

function sumRecord(rec: Record<string, string>): number {
  return Object.values(rec).reduce((s, v) => s + fromX18BigInt(v), 0);
}

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

const metrics = [
  { key: "volume24h", label: "24h Volume", icon: "chart" },
  { key: "currentOI", label: "Open Interest", icon: "layers" },
  { key: "currentTVL", label: "TVL", icon: "lock" },
  { key: "dau", label: "Active Traders", icon: "users" },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 200, damping: 24 },
  },
};

function MetricIcon({ type }: { type: string }) {
  const cls = "size-5 text-purple-400";
  switch (type) {
    case "chart":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      );
    case "layers":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
        </svg>
      );
    case "lock":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      );
    case "users":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      );
    default:
      return null;
  }
}

export function LiveMetrics() {
  const { snapshots, loading, error } = useProtocolMarketSnapshots(2);

  const data = useMemo(() => {
    const latest = snapshots[0];
    const prev = snapshots[1];
    if (!latest) return null;
    const latestVol = sumRecord(latest.cumulative_volumes);
    const prevVol = prev ? sumRecord(prev.cumulative_volumes) : latestVol;
    return {
      volume24h: latestVol - prevVol,
      currentOI: sumRecord(latest.open_interests),
      currentTVL: fromX18BigInt(latest.tvl),
      dau: latest.daily_active_users,
    };
  }, [snapshots]);

  const isLoading = loading || (!data && !error);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-20">
      <motion.div
        className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
      >
        {metrics.map((m) => (
          <motion.div
            key={m.key}
            variants={cardVariants}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-purple-500/30"
          >
            <div className="mb-2 flex items-center gap-2">
              <MetricIcon type={m.icon} />
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {error
                  ? "—"
                  : m.key === "dau"
                    ? data![m.key].toLocaleString("en-US")
                    : fmtCompact(data![m.key])}
              </p>
            )}
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
