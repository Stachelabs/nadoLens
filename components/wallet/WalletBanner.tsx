"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BannerType =
  | "WHALE_LOADING"
  | "QUEUE_WAIT"
  | "RETRY_IN_PROGRESS"
  | "RETRY_EXHAUSTED"
  | "RECOVERY";

export type BannerEntry = {
  type: BannerType;
  message: string;
  countdown?: number;
  onRetry?: () => void;
};

type BannerSeverity = "info" | "warn" | "error" | "success";

function severityOf(type: BannerType): BannerSeverity {
  switch (type) {
    case "WHALE_LOADING":
      return "info";
    case "QUEUE_WAIT":
    case "RETRY_IN_PROGRESS":
      return "warn";
    case "RETRY_EXHAUSTED":
      return "error";
    case "RECOVERY":
      return "success";
  }
}

const borderColor: Record<BannerSeverity, string> = {
  info: "border-l-primary",
  warn: "border-l-[var(--warn)]",
  error: "border-l-destructive",
  success: "border-l-[var(--bull)]",
};

const textColor: Record<BannerSeverity, string> = {
  info: "text-primary",
  warn: "text-[var(--warn)]",
  error: "text-destructive",
  success: "text-[var(--bull)]",
};

function BannerItem({ entry }: { entry: BannerEntry }) {
  const severity = severityOf(entry.type);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn(
        "border-l-4 bg-card px-3 py-2 text-sm transition-opacity duration-200",
        borderColor[severity],
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <span className={textColor[severity]}>{entry.message}</span>
      {entry.countdown !== undefined && entry.countdown > 0 && (
        <span className="ml-1 text-muted-foreground">
          ({entry.countdown}s)
        </span>
      )}
      {entry.type === "RETRY_EXHAUSTED" && entry.onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="ml-3 h-6 text-xs"
          onClick={entry.onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

export function WalletBanner({ banners }: { banners: BannerEntry[] }) {
  const displayRef = useRef<BannerEntry[]>([]);

  const limited = banners.slice(0, 2);
  displayRef.current = limited;

  if (limited.length === 0) return null;

  return (
    <div className="space-y-2">
      {limited.map((entry) => (
        <BannerItem key={entry.type} entry={entry} />
      ))}
    </div>
  );
}
