"use client";

import { ProtocolOIFunding } from "@/components/protocol/ProtocolOIFunding";
import { ProtocolOverview } from "@/components/protocol/ProtocolOverview";
import { ProtocolRevenue } from "@/components/protocol/ProtocolRevenue";
import { ProtocolTabNav } from "@/components/protocol/ProtocolTabNav";
import { ProtocolTVL } from "@/components/protocol/ProtocolTVL";
import { ProtocolVolumes } from "@/components/protocol/ProtocolVolumes";
import { useProtocolData } from "@/hooks/useProtocolData";
import { usePairsStore } from "@/store/pairsStore";
import { useProtocolStore } from "@/store/protocolStore";

export default function ProtocolPage() {
  useProtocolData();

  const activeTab = useProtocolStore((s) => s.activeTab);
  const tickers = useProtocolStore((s) => s.tickers);
  const tickersLoading = useProtocolStore((s) => s.tickersLoading);
  const perpAssets = usePairsStore((s) => s.perp);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl ont-bold tracking-tight text-foreground mb-6">
        Protocol statistics
      </h1>

      <ProtocolTabNav />

      <div className="mt-6">
        {activeTab === "overview" && <ProtocolOverview />}
        {activeTab === "volumes" && <ProtocolVolumes />}
        {activeTab === "oi-funding" && <ProtocolOIFunding />}
        {activeTab === "revenue" && (
          <ProtocolRevenue tickers={tickers} perpAssets={perpAssets} />
        )}
        {activeTab === "tvl" && (
          <ProtocolTVL tickers={tickers} perpAssets={perpAssets} />
        )}
      </div>
    </div>
  );
}
