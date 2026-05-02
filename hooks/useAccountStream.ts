"use client";

import { useEffect, useRef } from "react";
import { FillEventSchema, type FillEvent } from "@/lib/schemas/nado";

export type { FillEvent } from "@/lib/schemas/nado";

type UseAccountStreamOptions = {
  onFill: (event: FillEvent) => void;
};

function isFillEvent(data: unknown): data is FillEvent {
  return FillEventSchema.safeParse(data).success;
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
