"use client";

import { NadoCTA } from "@/components/NadoCTA";
import { AirdropPointsBreakdown } from "./AirdropPointsBreakdown";
import { AirdropSearch } from "./AirdropSearch";
import { AirdropSimulator } from "./AirdropSimulator";
import { AirdropStats } from "./AirdropStats";

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

      <NadoCTA />
    </div>
  );
}
