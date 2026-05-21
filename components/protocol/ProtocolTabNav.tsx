"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        {/* Mobile tab select */}
        <div className="flex flex-1 md:hidden">
          <Select
            value={TABS.find((t) => t.value === activeTab)?.label ?? "Overview"}
            onValueChange={(v) => {
              const tab = TABS.find((t) => t.label === v);
              if (tab) setActiveTab(tab.value);
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TABS.map((tab) => (
                <SelectItem key={tab.value} value={tab.label}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop tabs */}
        <div className="hidden md:flex flex-1" role="tablist">
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
