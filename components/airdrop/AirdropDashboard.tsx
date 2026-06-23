"use client";

import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { AirdropPointsBreakdown } from "./AirdropPointsBreakdown";
import { AirdropSearch } from "./AirdropSearch";
import { AirdropSimulator } from "./AirdropSimulator";
import { AirdropStats } from "./AirdropStats";

const REFLINK = "https://app.nado.xyz?join=ak8qEBT";

export function AirdropDashboard() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          1 — Wallet Lookup
        </h2>
        <AirdropSearch />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          2 — Statistics
        </h2>
        <AirdropStats />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          3 — Simulate
        </h2>
        <AirdropSimulator />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          4 — Points Supply
        </h2>
        <AirdropPointsBreakdown />
      </section>

      <Card className="flex flex-col items-center gap-4 border-brand/20 bg-card p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl bg-brand/10">
          <svg
            className="size-7 text-brand"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
            />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-foreground sm:text-xl">
          Not trading on{" "}
          <span className="bg-linear-to-r from-brand/70 to-brand bg-clip-text text-transparent">
            Nado
          </span>{" "}
          yet?
        </h3>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Don't miss out on one of the hottest airdrops to come. Trade perps &
          spot on Nado and get a share of the $INK airdrop supply from Kraken.
        </p>
        <div className="flex w-full max-w-sm flex-col gap-2.5">
          <a
            href={REFLINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-brand-foreground transition-all hover:bg-brand/90 hover:shadow-[0_0_24px_rgba(139,92,246,0.5)]"
          >
            Start Trading on Nado
            <ExternalLink className="size-4" />
          </a>
        </div>
      </Card>
    </div>
  );
}
