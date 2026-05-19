"use client";

import Link from "next/link";
import { Github, MessageCircle, ExternalLink } from "lucide-react";
import { useNadoLensStatus } from "@/hooks/useNadoLensStatus";

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const REFLINK = "https://app.nado.xyz/perpetuals?join=ak8qEBT";

const productLinks = [
  { label: "Wallet Explorer", href: "/wallet" },
  { label: "Protocol Analytics", href: "/protocol" },
  { label: "Airdrop Tracker", href: "#", soon: true },
];

const ecosystemLinks = [
  { label: "Trade on Nado", href: REFLINK, external: true },
  { label: "Nado Docs", href: "https://docs.nado.xyz", external: true },
  { label: "Ink Chain", href: "https://inkonchain.com", external: true },
  {
    label: "Ink Explorer",
    href: "https://explorer.inkonchain.com",
    external: true,
  },
  {
    label: "Kraken",
    href: "https://invite.kraken.com/JDNW/za46ig5d",
    external: true,
  },
];

const socialLinks = [
  { label: "Twitter / X", href: "https://x.com/nadoHQ", icon: XIcon },
  {
    label: "GitHub",
    href: "https://github.com/silent7-x/nadoLens",
    icon: Github,
  },
  { label: "Discord", href: "https://discord.gg/nado", icon: MessageCircle },
];

function StatusDot({ color }: { color: "green" | "red" | "orange" | "gray" }) {
  const colorMap = {
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

function statusColor(status: string | null, loading: boolean) {
  if (loading) return "gray" as const;
  if (status === "online") return "green" as const;
  if (status === "degraded") return "orange" as const;
  return "red" as const;
}

function statusLabel(status: string | null, loading: boolean) {
  if (loading) return "Checking...";
  if (status === "online") return "Online";
  if (status === "degraded") return "Degraded";
  return "Offline";
}

export function Footer() {
  const { status, nadoOk, loading } = useNadoLensStatus();
  const color = statusColor(status, loading);

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-lg font-bold tracking-tight text-foreground">
              NadoLens
            </span>
            <p className="text-sm text-muted-foreground">
              Analytics for Nado traders
            </p>
          </div>

          {/* Product */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-foreground">
              Product
            </span>
            <ul className="flex flex-col gap-2">
              {productLinks.map((link) => (
                <li key={link.label}>
                  {link.soon ? (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground/40">
                      {link.label}
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                        Soon
                      </span>
                    </span>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Ecosystem */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-foreground">
              Ecosystem
            </span>
            <ul className="flex flex-col gap-2">
              {ecosystemLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                    <ExternalLink className="size-3 opacity-40" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-foreground">
              Community
            </span>
            <ul className="flex flex-col gap-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <link.icon className="size-4" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                <StatusDot color={color} />
                NadoLens: {statusLabel(status, loading)}
              </span>
              <a
                href="https://nado-xyz.betteruptime.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                <StatusDot color={loading ? "gray" : nadoOk ? "green" : "red"} />
                Nado: {loading ? "Checking..." : nadoOk ? "Online" : "Offline"}
                <ExternalLink className="size-3 opacity-40" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright bar */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-3 text-center">
          <span className="text-sm text-muted-foreground/60">
            &copy; {new Date().getFullYear()} NadoLens &middot; Built on{" "}
            <a
              href="https://inkonchain.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ink Chain
            </a>{" "}
            by{" "}
            <a
              href="https://x.com/silen7_x"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:text-brand/80"
            >
              @silen7_x
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
