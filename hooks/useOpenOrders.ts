"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProductOrdersDataSchema } from "@/lib/schemas/nado";
import type { NadoOrder, OrderUpdateEvent } from "@/lib/schemas/nado";
import { usePairsStore, productName } from "@/store/pairsStore";
import { fromX18BigInt } from "@/types/nado";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 60_000;
const REFRESH_COOLDOWN_MS = 2_000;
const STREAM_REFRESH_DEBOUNCE_MS = 1_500;

type OpenOrderEntry = NadoOrder & {
  subaccountLabel: string;
};

type UseOpenOrdersResult = {
  orders: OpenOrderEntry[];
  loading: boolean;
  refreshing: boolean;
  refresh: (force?: boolean) => void;
  handleOrderUpdate: (event: OrderUpdateEvent) => void;
  /** Mark a digest as cancelled by this client so the stream-echo doesn't fire a redundant toast. */
  markSelfCancelled: (digest: string) => void;
};

const SELF_CANCEL_TTL_MS = 10_000;

function formatOrderPrice(priceX18: string): string {
  const price = fromX18BigInt(priceX18);
  const abs = Math.abs(price);
  if (abs > 0 && abs < 1) return price.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6 });
  if (abs < 1000) return price.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function useOpenOrders(
  address: string | null,
  crossSubaccounts: { subaccount: string; label: string }[] | null,
  phase1Ready: boolean,
  streamConnected = false,
): UseOpenOrdersResult {
  const [orders, setOrders] = useState<OpenOrderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const prevDigestsRef = useRef<Set<string> | null>(null);
  const prevOrderMapRef = useRef<Map<string, OpenOrderEntry>>(new Map());
  const lastRefreshRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const streamRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selfCancelledRef = useRef<Set<string>>(new Set());

  const markSelfCancelled = useCallback((digest: string) => {
    selfCancelledRef.current.add(digest);
    setTimeout(() => selfCancelledRef.current.delete(digest), SELF_CANCEL_TTL_MS);
  }, []);

  const fetchOrders = useCallback(
    async (signal: AbortSignal, isInitial: boolean) => {
      if (!address || !crossSubaccounts || crossSubaccounts.length === 0) return;

      const assets = usePairsStore.getState().assets;
      const productIds = assets
        .filter((a) => a.market_type === "perp")
        .map((a) => a.product_id);
      if (productIds.length === 0) return;

      const productIdsParam = productIds.join(",");
      const allOrders: OpenOrderEntry[] = [];

      for (let i = 0; i < crossSubaccounts.length; i++) {
        const sub = crossSubaccounts[i]!;
        if (signal.aborted) return;
        // Stagger sequential calls to avoid 429
        if (i > 0) await new Promise((r) => setTimeout(r, 500));
        try {
          const res = await fetch(
            `/api/wallet/${sub.subaccount}?query=orders&product_ids=${productIdsParam}`,
            { signal },
          );
          if (!res.ok) continue;
          const raw: unknown = await res.json();
          const parsed = ProductOrdersDataSchema.safeParse(raw);
          if (!parsed.success) continue;

          for (const po of parsed.data.product_orders) {
            for (const order of po.orders) {
              allOrders.push({ ...order, subaccountLabel: sub.label });
            }
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }

      if (signal.aborted) return;

      // Diff-based toast notifications (skip initial fetch)
      const currentDigests = new Set(allOrders.map((o) => o.digest));
      const currentMap = new Map(allOrders.map((o) => [o.digest, o]));

      if (!isInitial && prevDigestsRef.current) {
        const prevDigests = prevDigestsRef.current;
        const prevMap = prevOrderMapRef.current;

        for (const digest of currentDigests) {
          if (!prevDigests.has(digest)) {
            const order = currentMap.get(digest);
            if (order) {
              const pair = productName(order.product_id);
              const direction = fromX18BigInt(order.amount) >= 0 ? "Long" : "Short";
              const price = formatOrderPrice(order.price_x18);
              toast.info(`${pair} — New Order`, {
                description: `${direction} @ ${price}`,
              });
            }
          }
        }

        for (const digest of prevDigests) {
          if (!currentDigests.has(digest)) {
            const order = prevMap.get(digest);
            if (order) {
              const pair = productName(order.product_id);
              const direction = fromX18BigInt(order.amount) >= 0 ? "Long" : "Short";
              const price = formatOrderPrice(order.price_x18);
              toast.warning(`${pair} — Order Removed`, {
                description: `${direction} @ ${price}`,
              });
            }
          }
        }
      }

      prevDigestsRef.current = currentDigests;
      prevOrderMapRef.current = currentMap;

      // Sort: by product_id, then placed_at descending
      allOrders.sort((a, b) => {
        const byProduct = a.product_id - b.product_id;
        if (byProduct !== 0) return byProduct;
        return b.placed_at - a.placed_at;
      });

      if (mountedRef.current) {
        setOrders(allOrders);
      }
    },
    [address, crossSubaccounts],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!phase1Ready || !address || !crossSubaccounts) {
      setOrders([]);
      prevDigestsRef.current = null;
      prevOrderMapRef.current = new Map();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    const poll = async (isInitial: boolean) => {
      if (cancelled) return;
      if (isInitial) setLoading(true);

      await fetchOrders(controller.signal, isInitial);

      if (cancelled) return;
      if (isInitial && mountedRef.current) setLoading(false);

      if (!streamConnectedRef.current) {
        timerRef.current = setTimeout(() => {
          if (!cancelled) void poll(false);
        }, POLL_INTERVAL_MS);
      }
    };

    void poll(true);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      controller.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (streamRefreshTimerRef.current) clearTimeout(streamRefreshTimerRef.current);
    };
  }, [phase1Ready, address, crossSubaccounts, fetchOrders]);

  const streamConnectedRef = useRef(streamConnected);
  useEffect(() => { streamConnectedRef.current = streamConnected; }, [streamConnected]);

  const refresh = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
    lastRefreshRef.current = now;

    if (timerRef.current) clearTimeout(timerRef.current);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setRefreshing(true);
    fetchOrders(controller.signal, false).finally(() => {
      if (mountedRef.current) setRefreshing(false);
      if (!streamConnectedRef.current) {
        const nextController = new AbortController();
        abortRef.current = nextController;
        timerRef.current = setTimeout(() => {
          void fetchOrders(nextController.signal, false);
        }, POLL_INTERVAL_MS);
      }
    });
  }, [fetchOrders]);

  const handleOrderUpdate = useCallback((event: OrderUpdateEvent) => {
    const pair = productName(event.product_id);

    if (event.reason === "cancelled" || (event.reason === "filled" && event.amount === "0")) {
      const wasKnown = prevDigestsRef.current?.has(event.digest) ?? false;
      setOrders((prev) => {
        const filtered = prev.filter((o) => o.digest !== event.digest);
        if (filtered.length === prev.length) return prev;
        prevDigestsRef.current?.delete(event.digest);
        prevOrderMapRef.current.delete(event.digest);
        return filtered;
      });
      if (wasKnown) {
        if (event.reason === "cancelled") {
          const isSelfCancel = selfCancelledRef.current.has(event.digest);
          if (isSelfCancel) {
            selfCancelledRef.current.delete(event.digest);
          } else {
            toast.warning(`${pair} — Order Cancelled`);
          }
        } else {
          toast.info(`${pair} — Order Filled`);
        }
      }
    } else if (event.reason === "filled") {
      setOrders((prev) =>
        prev.map((o) =>
          o.digest === event.digest ? { ...o, amount: event.amount } : o,
        ),
      );
    } else if (event.reason === "placed") {
      if (streamRefreshTimerRef.current) clearTimeout(streamRefreshTimerRef.current);
      streamRefreshTimerRef.current = setTimeout(() => {
        refresh();
      }, STREAM_REFRESH_DEBOUNCE_MS);
    }
  }, [refresh]);

  return { orders, loading, refreshing, refresh, handleOrderUpdate, markSelfCancelled };
}
