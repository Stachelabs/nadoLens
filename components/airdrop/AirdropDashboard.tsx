"use client";

import { NadoCTA } from "@/components/NadoCTA";
import { useAirdropStore } from "@/store/airdropStore";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AirdropPointsBreakdown } from "./AirdropPointsBreakdown";
import { AirdropSearch } from "./AirdropSearch";
import { AirdropSimulator } from "./AirdropSimulator";
import { AirdropStats } from "./AirdropStats";

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function AirdropDashboard({
  initialAddress,
}: {
  initialAddress?: string;
}) {
  const setAddress = useAirdropStore((s) => s.setAddress);
  const setError = useAirdropStore((s) => s.setError);
  const router = useRouter();
  const didInit = useRef(false);

  useEffect(() => {
    if (initialAddress && !didInit.current) {
      didInit.current = true;
      if (ETH_ADDRESS_RE.test(initialAddress)) {
        setAddress(initialAddress);
      } else {
        setError("Invalid Ethereum address");
        router.replace("/airdrop");
      }
    }
  }, [initialAddress, setAddress, setError, router]);
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
