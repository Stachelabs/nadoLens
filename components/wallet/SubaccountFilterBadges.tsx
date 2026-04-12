"use client";

import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SUBACCOUNT_FILTER_ALL } from "@/lib/wallet/subaccountFilter";

type Props = {
  crossLabels: string[];
  displayLabel: string;
  onSelect: (label: string) => void;
};

export function SubaccountFilterBadges({
  crossLabels,
  displayLabel,
  onSelect,
}: Props) {
  const groups = [
    SUBACCOUNT_FILTER_ALL,
    ...crossLabels,
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {groups.map((label) => {
        const isSelected = label === displayLabel;
        return (
          <button
            key={label}
            type="button"
            className={cn(
              badgeVariants({
                variant: isSelected ? "secondary" : "outline",
              }),
              "h-5 w-12 cursor-pointer text-[10px] font-medium transition-colors",
              !isSelected && "text-muted-foreground",
            )}
            onClick={() => onSelect(label)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
