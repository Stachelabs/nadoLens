"use client";

import { ProtocolOIFunding } from "@/components/protocol/ProtocolOIFunding";
import { ProtocolOverview } from "@/components/protocol/ProtocolOverview";
import { ProtocolRevenue } from "@/components/protocol/ProtocolRevenue";
import { ProtocolTabNav } from "@/components/protocol/ProtocolTabNav";
import { ProtocolTVL } from "@/components/protocol/ProtocolTVL";
import { ProtocolVolumes } from "@/components/protocol/ProtocolVolumes";
import { ScrambleWord } from "@/components/ui/ScrambleWord";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useProtocolStore } from "@/store/protocolStore";

export default function ProtocolPage() {
  useProtocolData();

  const activeTab = useProtocolStore((s) => s.activeTab);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-xl font-bold tracking-tight text-foreground mb-6 sm:text-3xl">
        <ScrambleWord text="Protocol Statistics" delay={200} cycles={8} />
      </h1>

      <ProtocolTabNav />

      <div className="mt-6">
        {activeTab === "overview" && <ProtocolOverview />}
        {activeTab === "volumes" && <ProtocolVolumes />}
        {activeTab === "oi-funding" && <ProtocolOIFunding />}
        {activeTab === "revenue" && <ProtocolRevenue />}
        {activeTab === "tvl" && <ProtocolTVL />}
      </div>
    </div>
  );
}
