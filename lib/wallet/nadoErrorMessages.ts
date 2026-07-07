/** Nado engine/trigger server errors carry `responseData.error_code` (see EngineServerFailureError). */
type NadoServerError = {
  responseData: { error_code: number; error: string };
};

function hasResponseData(e: unknown): e is NadoServerError {
  if (typeof e !== "object" || e === null || !("responseData" in e)) return false;
  const responseData = (e as { responseData?: unknown }).responseData;
  return (
    typeof responseData === "object" &&
    responseData !== null &&
    typeof (responseData as { error_code?: unknown }).error_code === "number"
  );
}

// Trading-relevant subset of Nado's error_code table (docs.nado.xyz) — codes
// actually reachable from place-order / cancel-order / cancel-trigger-order.
const FRIENDLY_MESSAGES: Record<number, string> = {
  2000: "Price doesn't match this market's tick size — please retry.",
  2001: "Order size doesn't match this market's size increment — please retry.",
  2002: "Order amount is zero.",
  2003: "Order size is below the minimum for this market.",
  2004: "Signature took too long — the order expired before reaching the server. Nothing was placed, please retry.",
  2005: "You've reached the maximum number of open orders for this market.",
  2006: "This would drop your account health too low — reduce the size or add margin.",
  2007: "Price is too far from the current oracle price (must be within 20%–500%).",
  2008: "Post-only order would have crossed the book — adjust the price.",
  2009: "This order type isn't supported right now.",
  2010: "Order passed initial checks but failed on matching — please retry.",
  2011: "Request arrived too late to process — please retry.",
  2012: "Request arrived too early to process — please retry.",
  2013: "Duplicate order — this exact order was already submitted.",
  2014: "You can't cancel an order that belongs to a different subaccount.",
  2015: "Market not found for this product.",
  2016: "Invalid product for this order.",
  2020: "This order was already filled, cancelled, or no longer exists.",
  2064: "This would increase your position instead of reducing it — it's probably already closed. Refresh to check.",
  2067: "Reduce-only isn't allowed on this order type.",
  2068: "Nado is under maintenance — please try again shortly.",
  2069: "Trading is currently blocked for this market.",
};

/** User-facing message for a caught order/cancel error — friendly text for known Nado error codes, raw message otherwise. */
export function getNadoErrorMessage(e: unknown): string {
  if (hasResponseData(e)) {
    const { error_code, error } = e.responseData;
    return FRIENDLY_MESSAGES[error_code] ?? `${error_code}: ${error}`;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong — please retry.";
}
