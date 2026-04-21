"use client";

import { useEffect, useRef } from "react";

export type FillEvent = {
  subaccount: string;
  product_id: number;
  filled_qty: string;
  price: string;
  is_bid: boolean;
  is_taker: boolean;
  fee: string;
  submission_idx: string;
  order_digest: string;
};

type UseAccountStreamOptions = {
  onFill: (event: FillEvent) => void;
};

function isFillEvent(data: unknown): data is FillEvent {
  if (data === null || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.subaccount === "string" &&
    typeof d.product_id === "number" &&
    typeof d.filled_qty === "string" &&
    typeof d.price === "string" &&
    typeof d.is_bid === "boolean" &&
    typeof d.is_taker === "boolean" &&
    typeof d.fee === "string" &&
    typeof d.submission_idx === "string"
  );
}

/**
 * Opens an SSE connection to the ws-proxy for a given subaccount (bytes32).
 * Fires onFill when a fill event arrives. Reconnects with exponential backoff.
 * The REST poll in useWalletData remains the fallback if SSE is unavailable.
 */
export function useAccountStream(
  subaccount: string | null,
  { onFill }: UseAccountStreamOptions,
): void {
  // Keep latest callback in a ref so the SSE handler always calls the current version
  const onFillRef = useRef(onFill);
  useEffect(() => {
    onFillRef.current = onFill;
  });

  useEffect(() => {
    if (!subaccount || typeof window === "undefined") return;

    const wsProxyUrl = process.env.NEXT_PUBLIC_WS_PROXY_URL;
    if (!wsProxyUrl) return;

    let es: EventSource | null = null;
    let attempt = 0;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      const url = `${wsProxyUrl}/sse?subaccount=${encodeURIComponent(subaccount!)}`;
      es = new EventSource(url);

      es.onmessage = (event: MessageEvent<string>) => {
        attempt = 0; // reset backoff on successful message
        try {
          const data: unknown = JSON.parse(event.data);
          if (isFillEvent(data)) {
            onFillRef.current(data);
          }
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      es = null;
    };
  }, [subaccount]);
}
