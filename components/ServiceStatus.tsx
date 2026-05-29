"use client";

import { ExternalLink } from "lucide-react";
import { useNadoLensStatus } from "@/hooks/useNadoLensStatus";

type DotColor = "green" | "red" | "orange" | "gray";

function StatusDot({ color }: { color: DotColor }) {
  const colorMap: Record<DotColor, string> = {
    green: "bg-emerald-400 shadow-emerald-400/50",
    red: "bg-red-400 shadow-red-400/50",
    orange: "bg-orange-400 shadow-orange-400/50",
    gray: "bg-zinc-500",
  };
  return (
    <span
      className={`inline-block size-2 rounded-full shadow-[0_0_6px] ${colorMap[color]}`}
    />
  );
}

function resolveColor(status: string | null, loading: boolean): DotColor {
  if (loading) return "gray";
  if (status === "online") return "green";
  if (status === "degraded") return "orange";
  return "red";
}

function resolveLabel(status: string | null, loading: boolean) {
  if (loading) return "Checking...";
  if (status === "online") return "Online";
  if (status === "degraded") return "Degraded";
  return "Offline";
}

export function ServiceStatus({ horizontal = false }: { horizontal?: boolean }) {
  const { status, nadoOk, loading } = useNadoLensStatus();

  return (
    <div className={horizontal ? "flex flex-row items-center justify-center gap-4" : "flex flex-col gap-1.5"}>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
        <StatusDot color={resolveColor(status, loading)} />
        NadoLens: {resolveLabel(status, loading)}
      </span>
      <a
        href="https://nado-xyz.betteruptime.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-muted-foreground/80 transition-colors hover:text-muted-foreground"
      >
        <StatusDot color={loading ? "gray" : nadoOk ? "green" : "red"} />
        Nado: {loading ? "Checking..." : nadoOk ? "Online" : "Offline"}
        <ExternalLink className="size-3 opacity-40" />
      </a>
    </div>
  );
}
