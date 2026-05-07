"use client";

import { cn } from "@/lib/utils";
import { useProtocolStore, type ProtocolTab } from "@/store/protocolStore";
import { TradeOnNadoButton } from "@/components/TradeOnNadoButton";

const TABS: { value: ProtocolTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "volumes", label: "Volumes" },
  { value: "oi-funding", label: "OI, Funding & Liquidations" },
  { value: "revenue", label: "Revenue & Users" },
  { value: "tvl", label: "TVL & Yield" },
];

export function ProtocolTabNav() {
  const activeTab = useProtocolStore((s) => s.activeTab);
  const setActiveTab = useProtocolStore((s) => s.setActiveTab);

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2">
        <div className="flex flex-1" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 pb-px pr-0.5">
          <TradeOnNadoButton />
        </div>
      </div>
    </div>
  );
}
