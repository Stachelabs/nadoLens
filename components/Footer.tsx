"use client";

import Link from "next/link";
import { Github, MessageCircle, ExternalLink } from "lucide-react";
import { ServiceStatus } from "@/components/ServiceStatus";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

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
  { label: "TG Notifications", href: "#", soon: true },
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
  { label: "Twitter / X", href: "https://x.com/nadolens", icon: XIcon },
  { label: "Twitter / X (Nado)", href: "https://x.com/nadoHQ", icon: XIcon },
  {
    label: "Discord (Nado)",
    href: "https://discord.gg/nado",
    icon: MessageCircle,
  },
  {
    label: "GitHub",
    href: "https://github.com/stachelabs",
    icon: Github,
  },
];

function ProductLinks() {
  return (
    <ul className="flex flex-col gap-2">
      {productLinks.map((link) => (
        <li key={link.label}>
          {link.soon ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground/40">
              {link.label}
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
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
  );
}

function EcosystemLinks() {
  return (
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
  );
}

function CommunityLinks() {
  return (
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
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-2">
        {/* Brand — always visible */}
        <div className="flex flex-col items-center gap-1 pb-2 sm:hidden">
          <span className="text-lg font-bold tracking-tight text-foreground">
            NadoLens
          </span>
          <p className="text-sm text-muted-foreground">
            Analytics for Nado traders
          </p>
        </div>

        {/* ── Desktop: 4-col grid ── */}
        <div className="hidden gap-8 sm:grid sm:grid-cols-2 md:grid-cols-4">
          <div className="flex flex-col items-center gap-1">
            <span className="text-lg font-bold tracking-tight text-foreground">
              NadoLens
            </span>
            <p className="text-sm text-muted-foreground">
              Analytics for Nado traders
            </p>
            <div className="mt-10 w-full max-w-[175px]">
              <ServiceStatus />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-foreground">
              Product
            </span>
            <ProductLinks />
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-foreground">
              Ecosystem
            </span>
            <EcosystemLinks />
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-foreground">
              Community
            </span>
            <CommunityLinks />
          </div>
        </div>

        {/* ── Mobile: accordion ── */}
        <div className="sm:hidden">
          <Accordion>
            <AccordionItem value="product">
              <AccordionTrigger>Product</AccordionTrigger>
              <AccordionContent>
                <ProductLinks />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="ecosystem">
              <AccordionTrigger>Ecosystem</AccordionTrigger>
              <AccordionContent>
                <EcosystemLinks />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="community">
              <AccordionTrigger>Community</AccordionTrigger>
              <AccordionContent>
                <CommunityLinks />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="pt-4">
            <ServiceStatus horizontal />
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
              href="https://x.com/stache_dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:text-brand/80"
            >
              @stache.dev
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
