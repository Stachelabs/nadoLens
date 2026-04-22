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
 * Opens one SSE connection per subaccount bytes32.
 * Fires onFill when any fill event arrives. Each connection reconnects independently
 * with exponential backoff. The REST poll in useWalletData remains the fallback.
 */
export function useAccountStream(
  subaccounts: string[] | null,
  { onFill }: UseAccountStreamOptions,
): void {
  const onFillRef = useRef(onFill);
  useEffect(() => {
    onFillRef.current = onFill;
  });

  useEffect(() => {
    if (!subaccounts || subaccounts.length === 0 || typeof window === "undefined") return;

    const wsProxyUrl = process.env.NEXT_PUBLIC_WS_PROXY_URL;
    if (!wsProxyUrl) return;

    // One cleanup per subaccount — collected for teardown
    const cleanups: (() => void)[] = [];

    for (const subaccount of subaccounts) {
      let es: EventSource | null = null;
      let attempt = 0;
      let cancelled = false;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

      function connect() {
        if (cancelled) return;
        const url = `${wsProxyUrl}/sse?subaccount=${encodeURIComponent(subaccount)}`;
        es = new EventSource(url);

        es.onmessage = (event: MessageEvent<string>) => {
          attempt = 0;
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

      cleanups.push(() => {
        cancelled = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        es?.close();
        es = null;
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  // Re-run only when the subaccounts array identity changes (derived from stable state).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subaccounts?.join(",")]);
}
