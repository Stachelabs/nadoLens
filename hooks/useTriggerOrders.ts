"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { TriggerListOrdersResponseSchema } from "@/lib/schemas/nado";
import type { TriggerOrderInfo } from "@/lib/schemas/nado";
import { usePairsStore, productName } from "@/store/pairsStore";
import { fromX18BigInt } from "@/types/nado";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 60_000;
const RECV_TIME_VALIDITY_S = 300;
const RECV_TIME_REAUTH_BUFFER_S = 30;

const TRIGGER_DOMAIN = {
  name: "Nado" as const,
  version: "0.0.1" as const,
  chainId: 57073,
  verifyingContract: "0x05ec92d78ed421f3d3ada77ffde167106565974e" as const,
} as const;

const TRIGGER_TYPES = {
  ListTriggerOrders: [
    { name: "sender", type: "bytes32" },
    { name: "recvTime", type: "uint64" },
  ],
} as const;

const ACTIVE_STATUS_TYPES = [
  "waiting_price",
  "waiting_dependency",
  "triggering",
  "twap_executing",
];

function toDefaultSubaccount(address: string): `0x${string}` {
  const addr = address.toLowerCase().replace("0x", "");
  return `0x${addr}64656661756c740000000000` as `0x${string}`;
}

function formatTriggerPrice(priceX18: string): string {
  const price = fromX18BigInt(priceX18);
  const abs = Math.abs(price);
  if (abs > 0 && abs < 1) return price.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6 });
  if (abs < 1000) return price.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export type TriggerOrderEntry = TriggerOrderInfo & {
  subaccountLabel: string;
};

type StoredAuth = {
  sender: `0x${string}`;
  recvTime: string;
  signature: string;
  expiresAt: number;
};

type UseTriggerOrdersResult = {
  triggerOrders: TriggerOrderEntry[];
  loading: boolean;
  signatureNeeded: boolean;
  requestSignature: () => void;
  hasSigned: boolean;
  refresh: () => void;
  refreshing: boolean;
};

export function useTriggerOrders(
  exploredAddress: string | null,
  crossSubaccounts: { subaccount: string; label: string }[] | null,
  phase1Ready: boolean,
): UseTriggerOrdersResult {
  const { address: connectedAddress } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [triggerOrders, setTriggerOrders] = useState<TriggerOrderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const storedAuthRef = useRef<StoredAuth | null>(null);
  const signingRef = useRef<Promise<StoredAuth | null> | null>(null);
  const prevDigestsRef = useRef<Set<string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const isOwnWallet =
    !!exploredAddress &&
    !!connectedAddress &&
    exploredAddress.toLowerCase() === connectedAddress.toLowerCase();

  const signatureNeeded = isOwnWallet && !hasSigned && phase1Ready;

  useEffect(() => {
    if (!isOwnWallet) {
      setHasSigned(false);
      setTriggerOrders([]);
      storedAuthRef.current = null;
      prevDigestsRef.current = null;
    }
  }, [isOwnWallet]);

  const signOnce = useCallback(
    async (): Promise<StoredAuth | null> => {
      if (!connectedAddress) return null;

      const stored = storedAuthRef.current;
      if (stored && Date.now() / 1000 < stored.expiresAt - RECV_TIME_REAUTH_BUFFER_S) {
        return stored;
      }

      if (signingRef.current) return signingRef.current;

      const doSign = async (): Promise<StoredAuth | null> => {
        const sender = toDefaultSubaccount(connectedAddress);
        const recvTimeS = Math.floor(Date.now() / 1000) + RECV_TIME_VALIDITY_S;
        const recvTime = String(recvTimeS * 1000);

        try {
          const signature = await signTypedDataAsync({
            domain: TRIGGER_DOMAIN,
            types: TRIGGER_TYPES,
            primaryType: "ListTriggerOrders",
            message: { sender, recvTime: BigInt(recvTime) },
          });

          const auth: StoredAuth = {
            sender,
            recvTime,
            signature,
            expiresAt: recvTimeS,
          };
          storedAuthRef.current = auth;
          return auth;
        } catch (e) {
          if (e instanceof Error && e.message.includes("User rejected")) {
            storedAuthRef.current = null;
            setHasSigned(false);
            setTriggerOrders([]);
            prevDigestsRef.current = null;
            return null;
          }
          throw e;
        } finally {
          signingRef.current = null;
        }
      };

      const promise = doSign();
      signingRef.current = promise;
      return promise;
    },
    [connectedAddress, signTypedDataAsync],
  );

  const fetchWithStoredSig = useCallback(
    async (signal: AbortSignal, isInitial: boolean) => {
      const auth = await signOnce();
      if (!auth) return;
      if (signal.aborted) return;

      const assets = usePairsStore.getState().assets;
      const productIds = assets
        .filter((a) => a.market_type === "perp")
        .map((a) => a.product_id);

      try {
        const res = await fetch("/api/trigger-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: auth.sender,
            recvTime: auth.recvTime,
            signature: auth.signature,
            productIds: productIds.length > 0 ? productIds : undefined,
            statusTypes: ACTIVE_STATUS_TYPES,
          }),
          signal,
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          console.error("[useTriggerOrders] API error", res.status, errorBody);
          if (res.status === 401 || res.status === 403) {
            storedAuthRef.current = null;
          }
          return;
        }

        const raw: unknown = await res.json();
        const parsed = TriggerListOrdersResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error("[useTriggerOrders] validation failed", parsed.error.issues);
          return;
        }

        const allOrders: TriggerOrderEntry[] = parsed.data.data.orders.map((orderInfo) => ({
          ...orderInfo,
          subaccountLabel: "default",
        }));

        if (signal.aborted) return;

        const currentDigests = new Set(
          allOrders.map((o) => o.order.digest ?? `${o.order.product_id}-${o.placed_at}`),
        );

        if (!isInitial && prevDigestsRef.current) {
          const prev = prevDigestsRef.current;
          for (const d of currentDigests) {
            if (!prev.has(d)) {
              const entry = allOrders.find(
                (o) => (o.order.digest ?? `${o.order.product_id}-${o.placed_at}`) === d,
              );
              if (entry) {
                const pair = productName(entry.order.product_id);
                const direction = fromX18BigInt(entry.order.order.amount) >= 0 ? "Long" : "Short";
                const price = formatTriggerPrice(entry.order.order.priceX18);
                toast.info(`${pair} — New Trigger Order`, { description: `${direction} @ ${price}` });
              }
            }
          }
          for (const d of prev) {
            if (!currentDigests.has(d)) {
              toast.warning("Trigger order removed");
            }
          }
        }

        prevDigestsRef.current = currentDigests;

        allOrders.sort((a, b) => {
          const byProduct = a.order.product_id - b.order.product_id;
          if (byProduct !== 0) return byProduct;
          return b.placed_at - a.placed_at;
        });

        if (mountedRef.current) {
          setTriggerOrders(allOrders);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[useTriggerOrders] unexpected error", e);
      }
    },
    [signOnce],
  );

  const startPolling = useCallback(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    let cancelled = false;

    const poll = async (isInitial: boolean) => {
      if (cancelled) return;
      if (isInitial) setLoading(true);

      await fetchWithStoredSig(controller.signal, isInitial);

      if (cancelled) return;
      if (isInitial && mountedRef.current) setLoading(false);

      timerRef.current = setTimeout(() => {
        if (!cancelled) void poll(false);
      }, POLL_INTERVAL_MS);
    };

    void poll(true);

    return () => {
      cancelled = true;
      controller.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchWithStoredSig]);

  useEffect(() => {
    mountedRef.current = true;
    if (!hasSigned || !isOwnWallet || !phase1Ready) return;

    const cleanup = startPolling();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [hasSigned, isOwnWallet, phase1Ready, startPolling]);

  const requestSignature = useCallback(() => {
    setHasSigned(true);
  }, []);

  const refresh = useCallback(() => {
    if (!hasSigned || !storedAuthRef.current) return;

    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    setRefreshing(true);
    fetchWithStoredSig(controller.signal, false).finally(() => {
      if (mountedRef.current) setRefreshing(false);
      if (!controller.signal.aborted) {
        timerRef.current = setTimeout(() => {
          const nextController = new AbortController();
          abortRef.current = nextController;
          void fetchWithStoredSig(nextController.signal, false);
        }, POLL_INTERVAL_MS);
      }
    });
  }, [hasSigned, fetchWithStoredSig]);

  return {
    triggerOrders,
    loading,
    refreshing,
    signatureNeeded,
    requestSignature,
    hasSigned,
    refresh,
  };
}
