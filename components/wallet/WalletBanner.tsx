"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

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
  retryDisabled?: boolean;
};

type BannerSeverity = "info" | "warn" | "error" | "success";

const DISMISS_COOLDOWN_MS = 30_000;

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

function BannerItem({
  entry,
  onDismiss,
}: {
  entry: BannerEntry;
  onDismiss: (type: BannerType) => void;
}) {
  const severity = severityOf(entry.type);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn(
        "relative border-l-4 bg-card px-3 py-2 pr-8 text-sm transition-opacity duration-200",
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
      {entry.type === "RETRY_IN_PROGRESS" && entry.onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="ml-3 h-6 text-xs"
          disabled={entry.retryDisabled}
          onClick={entry.onRetry}
        >
          Retry now
        </Button>
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
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors"
        onClick={() => onDismiss(entry.type)}
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function WalletBanner({ banners }: { banners: BannerEntry[] }) {
  const dismissedAtRef = useRef<Map<BannerType, number>>(new Map());
  const [, forceUpdate] = useState(0);

  const handleDismiss = useCallback((type: BannerType) => {
    dismissedAtRef.current.set(type, Date.now());
    forceUpdate((n) => n + 1);
  }, []);

  const now = Date.now();
  const filtered = banners.filter((b) => {
    const dismissedAt = dismissedAtRef.current.get(b.type);
    if (dismissedAt === undefined) return true;
    if (now - dismissedAt < DISMISS_COOLDOWN_MS) return false;
    dismissedAtRef.current.delete(b.type);
    return true;
  });

  const limited = filtered.slice(0, 2);

  if (limited.length === 0) return null;

  return (
    <div className="space-y-2">
      {limited.map((entry) => (
        <BannerItem
          key={entry.type}
          entry={entry}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}
