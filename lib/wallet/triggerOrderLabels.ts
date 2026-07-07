import type { TriggerOrderInfo } from "@/lib/schemas/nado";

export function getOrderExecutionType(appendix?: string): "default" | "fok" | "ioc" | "post_only" {
  if (!appendix) return "default";
  try {
    const bits = (BigInt(appendix) >> BigInt(9)) & BigInt(0b11);
    if (bits === BigInt(1)) return "fok";
    if (bits === BigInt(2)) return "ioc";
    if (bits === BigInt(3)) return "post_only";
    return "default";
  } catch {
    return "default";
  }
}

export function isTriggerAbove(trigger: TriggerOrderInfo["order"]["trigger"]): boolean | null {
  if (!("price_trigger" in trigger)) return null;
  const req = trigger.price_trigger.price_requirement;
  if ("oracle_price_above" in req || "last_price_above" in req || "mid_price_above" in req) return true;
  if ("oracle_price_below" in req || "last_price_below" in req || "mid_price_below" in req) return false;
  return null;
}

export function getTriggerTypeLabel(
  trigger: TriggerOrderInfo["order"]["trigger"],
  amount: number,
  appendix?: string,
): string {
  if ("time_trigger" in trigger) return "TWAP";

  const above = isTriggerAbove(trigger);
  if (above === null) return "Trigger";

  const isSell = amount < 0;
  const isTP = (isSell && above) || (!isSell && !above);

  const execType = getOrderExecutionType(appendix);
  const isMarket = execType === "ioc" || execType === "fok";

  const kind = isTP ? "TP" : "SL";
  const exec = isMarket ? "Market" : "Limit";
  return `${kind} ${exec}`;
}
