"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { signTypedData } from "viem/actions";
import { TriggerListOrdersResponseSchema } from "@/lib/schemas/nado";
import type { TriggerOrderInfo } from "@/lib/schemas/nado";
import { usePairsStore, productName } from "@/store/pairsStore";
import { fromX18BigInt } from "@/types/nado";
import { toast } from "sonner";

const RECV_TIME_VALIDITY_S = 90;
const RECV_TIME_REAUTH_BUFFER_S = 10;
const LINKED_SIGNER_POLL_MS = 30_000;

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

type LinkedSignerClient = Parameters<typeof signTypedData>[0] | null;

type LinkedSignerMap = Map<string, { subaccountName: string; walletClient: LinkedSignerClient }>;

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
  linkedSigners?: LinkedSignerMap,
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

  const hasLinkedSigner = !!linkedSigners && linkedSigners.size > 0;

  const signForSubaccount = useCallback(
    async (
      senderBytes32: `0x${string}`,
      linkedClient: LinkedSignerClient,
    ): Promise<StoredAuth | null> => {
      const recvTimeS = Math.floor(Date.now() / 1000) + RECV_TIME_VALIDITY_S;
      const recvTime = String(recvTimeS * 1000);

      try {
        let signature: `0x${string}`;

        if (linkedClient && linkedClient.account) {
          signature = await signTypedData(linkedClient, {
            account: linkedClient.account,
            domain: TRIGGER_DOMAIN,
            types: TRIGGER_TYPES,
            primaryType: "ListTriggerOrders" as const,
            message: { sender: senderBytes32, recvTime: BigInt(recvTime) },
          });
        } else {
          signature = await signTypedDataAsync({
            domain: TRIGGER_DOMAIN,
            types: TRIGGER_TYPES,
            primaryType: "ListTriggerOrders",
            message: { sender: senderBytes32, recvTime: BigInt(recvTime) },
          });
        }

        return { sender: senderBytes32, recvTime, signature, expiresAt: recvTimeS };
      } catch (e) {
        if (e instanceof Error && e.message.includes("User rejected")) {
          setHasSigned(false);
          setTriggerOrders([]);
          prevDigestsRef.current = null;
          return null;
        }
        throw e;
      }
    },
    [signTypedDataAsync],
  );

  const signOnce = useCallback(
    async (): Promise<StoredAuth | null> => {
      if (!connectedAddress) return null;

      // For linked signer path, re-sign every time (free, no popup)
      if (hasLinkedSigner) return null;

      const stored = storedAuthRef.current;
      if (stored && Date.now() / 1000 < stored.expiresAt - RECV_TIME_REAUTH_BUFFER_S) {
        return stored;
      }

      if (signingRef.current) return signingRef.current;

      const doSign = async (): Promise<StoredAuth | null> => {
        const sender = toDefaultSubaccount(connectedAddress);
        const auth = await signForSubaccount(sender, null);
        if (auth) storedAuthRef.current = auth;
        return auth;
      };

      const promise = doSign();
      signingRef.current = promise;
      return promise.finally(() => { signingRef.current = null; });
    },
    [connectedAddress, hasLinkedSigner, signForSubaccount],
  );

  const fetchForSubaccount = useCallback(
    async (
      senderBytes32: `0x${string}`,
      label: string,
      linkedClient: LinkedSignerClient,
      signal: AbortSignal,
    ): Promise<TriggerOrderEntry[]> => {
      const auth = linkedClient
        ? await signForSubaccount(senderBytes32, linkedClient)
        : await signOnce();
      if (!auth) return [];
      if (signal.aborted) return [];

      const assets = usePairsStore.getState().assets;
      const productIds = assets
        .filter((a) => a.market_type === "perp")
        .map((a) => a.product_id);

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
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          storedAuthRef.current = null;
        }
        return [];
      }

      const raw: unknown = await res.json();
      const parsed = TriggerListOrdersResponseSchema.safeParse(raw);
      if (!parsed.success) return [];

      return parsed.data.data.orders.map((orderInfo) => ({
        ...orderInfo,
        subaccountLabel: label,
      }));
    },
    [signOnce, signForSubaccount],
  );

  const fetchWithStoredSig = useCallback(
    async (signal: AbortSignal, isInitial: boolean) => {
      try {
        let allOrders: TriggerOrderEntry[] = [];

        if (hasLinkedSigner && crossSubaccounts) {
          // Multi-subaccount: query each cross subaccount with its linked signer
          for (let i = 0; i < crossSubaccounts.length; i++) {
            if (signal.aborted) return;
            const sub = crossSubaccounts[i]!;
            const entry = linkedSigners?.get(sub.subaccount);
            const client = entry?.walletClient ?? null;
            if (!client) continue;
            if (i > 0) await new Promise((r) => setTimeout(r, 500));
            const orders = await fetchForSubaccount(
              sub.subaccount as `0x${string}`,
              sub.label,
              client,
              signal,
            );
            allOrders = [...allOrders, ...orders];
          }
        } else {
          // Fallback: single subaccount with wagmi popup
          allOrders = await fetchForSubaccount(
            toDefaultSubaccount(connectedAddress!) as `0x${string}`,
            "default",
            null,
            signal,
          );
        }

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

        [...allOrders].sort((a, b) => {
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
    [hasLinkedSigner, crossSubaccounts, linkedSigners, connectedAddress, fetchForSubaccount],
  );

  const fetchOnce = useCallback(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setLoading(true);
    fetchWithStoredSig(controller.signal, true).finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [fetchWithStoredSig]);

  useEffect(() => {
    mountedRef.current = true;
    if (!hasSigned || !isOwnWallet || !phase1Ready) return;

    const cleanup = fetchOnce();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [hasSigned, isOwnWallet, phase1Ready, fetchOnce]);

  // Auto-poll when linked signer is available
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!hasLinkedSigner || !hasSigned || !isOwnWallet || !phase1Ready) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(() => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      void fetchWithStoredSig(controller.signal, false);
    }, LINKED_SIGNER_POLL_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [hasLinkedSigner, hasSigned, isOwnWallet, phase1Ready, fetchWithStoredSig]);

  // Auto-sign when linked signer becomes available
  useEffect(() => {
    if (hasLinkedSigner && !hasSigned && isOwnWallet && phase1Ready) {
      setHasSigned(true);
    }
  }, [hasLinkedSigner, hasSigned, isOwnWallet, phase1Ready]);

  const requestSignature = useCallback(() => {
    setHasSigned(true);
  }, []);

  const refresh = useCallback(() => {
    if (!hasSigned) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRefreshing(true);
    fetchWithStoredSig(controller.signal, false).finally(() => {
      if (mountedRef.current) setRefreshing(false);
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
