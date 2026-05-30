"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  /** Ordered list; first entry is usually "All". */
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  align?: "start" | "center" | "end";
  className?: string;
};

export function AccountFilterSelect({
  options,
  value,
  onValueChange,
  align = "end",
  className,
}: Props) {
  const safeValue = options.includes(value) ? value : (options[0] ?? "");

  return (
    <Select
      value={safeValue}
      onValueChange={(v) => {
        if (v != null) onValueChange(v);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Filter by account"
        className={cn(
          "max-w-30 min-w-14 dark:border-border/40 px-2 text-[11px] font-medium text-muted-foreground",
          "[&_svg]:size-3 [&_svg]:opacity-60",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align={align}>
        <SelectGroup>
          <SelectLabel className="px-1.5 py-1 text-[11px]">Account</SelectLabel>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt} className="py-1.5 text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
