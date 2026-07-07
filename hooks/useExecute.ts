"use client";

import { useNadoClient } from "@/hooks/useNadoClient";
import { packOrderAppendix } from "@nadohq/shared";
import BigNumber from "bignumber.js";
import { useCallback } from "react";

export const SDK_TIMEOUT_MS = 30_000;
// Order validity must track the client timeout closely — Nado rejects an order
// server-side once past its own `expiration` ("Invalid order expiration: the
// order has already expired"), so a short window here converts a slow wallet
// signature into a clean rejection instead of a real fill landing silently
// after the UI already gave up and re-enabled Confirm. +10s covers normal
// signature + POST latency without leaving much room for the race.
export const ORDER_EXPIRY_S = Math.ceil(SDK_TIMEOUT_MS / 1000) + 10;

type CancelParams = {
  subaccountName: string;
  productId: number;
  digest: string;
};

type CancelProductTriggerOrdersParams = {
  subaccountName: string;
  productId: number;
};

type CloseParams = {
  subaccountName: string;
  productId: number;
  amountX18: string;
  isLong: boolean;
  isolated: boolean;
  markPrice: number;
  /** User-chosen slippage tolerance, e.g. 1 = 1%. */
  slippagePct: number;
};

// Nado hard-rejects orders outside 20%-500% of oracle price (error_code 2007) —
// this is a protocol-wide constant, not per-product. Clamp with a small safety
// margin so float drift never lands exactly on the boundary.
const PROTOCOL_MIN_PRICE_MULT = 0.21;
const PROTOCOL_MAX_PRICE_MULT = 4.9;

function withTimeout<T>(
  promise: Promise<T>,
  // Promise.race never cancels the loser — if the underlying SDK call (wallet
  // signature + network POST) resolves AFTER the timeout already won the race
  // and the UI moved on, this fires so the caller can reconcile instead of
  // silently discarding a real result.
  onLateSettle?: (outcome: { ok: true } | { ok: false }) => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  let timedOut = false;
  promise.then(
    () => { if (timedOut) onLateSettle?.({ ok: true }); },
    () => { if (timedOut) onLateSettle?.({ ok: false }); },
  );
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Request timed out"));
    }, SDK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function useExecute() {
  const client = useNadoClient();

  const cancelLimitOrder = useCallback(
    async (params: CancelParams) => {
      if (!client) throw new Error("Wallet not connected");
      return withTimeout(
        client.market.cancelOrders({
          subaccountName: params.subaccountName,
          productIds: [params.productId],
          digests: [params.digest],
        }),
      );
    },
    [client],
  );

  const cancelTriggerOrder = useCallback(
    async (params: CancelParams) => {
      if (!client) throw new Error("Wallet not connected");
      return withTimeout(
        client.market.cancelTriggerOrders({
          subaccountName: params.subaccountName,
          productIds: [params.productId],
          digests: [params.digest],
        }),
      );
    },
    [client],
  );

  // Fallback for trigger orders whose `digest` came back null from the API —
  // cancels every trigger order on this product+subaccount instead of one by
  // digest, since there's no per-order ID to target.
  const cancelTriggerProductOrders = useCallback(
    async (params: CancelProductTriggerOrdersParams) => {
      if (!client) throw new Error("Wallet not connected");
      return withTimeout(
        client.market.cancelTriggerProductOrders({
          subaccountName: params.subaccountName,
          productIds: [params.productId],
        }),
      );
    },
    [client],
  );

  const closePosition = useCallback(
    async (params: CloseParams, onLateSettle?: (outcome: { ok: true } | { ok: false }) => void) => {
      if (!client) throw new Error("Wallet not connected");
      const appendix = packOrderAppendix({
        reduceOnly: true,
        orderExecutionType: "ioc",
        ...(params.isolated ? { isolated: { margin: BigInt(0) } } : {}),
      });
      const slippageMult = params.slippagePct / 100;
      const rawPrice = params.isLong
        ? params.markPrice * (1 - slippageMult)
        : params.markPrice * (1 + slippageMult);
      const boundPrice = Math.min(
        Math.max(rawPrice, params.markPrice * PROTOCOL_MIN_PRICE_MULT),
        params.markPrice * PROTOCOL_MAX_PRICE_MULT,
      );

      // Nado also rejects prices not divisible by the product's price_increment_x18
      // (error_code 2000) — snap to the market's actual tick size. No fallback:
      // an unverified tick size risks a silently wrong price, so fail loudly instead.
      const markets = await withTimeout(client.market.getCachedAllMarkets());
      const market = markets.find((m) => m.productId === params.productId);
      if (!market) {
        throw new Error("Unable to verify this market's price tick — please retry");
      }
      const roundedPrice = new BigNumber(boundPrice)
        .dividedBy(market.priceIncrement)
        .integerValue(BigNumber.ROUND_HALF_UP)
        .multipliedBy(market.priceIncrement);

      return withTimeout(
        client.market.placeOrder({
          productId: params.productId,
          order: {
            subaccountName: params.subaccountName,
            price: roundedPrice.toFixed(),
            amount: params.amountX18,
            expiration: String(Math.floor(Date.now() / 1000) + ORDER_EXPIRY_S),
            appendix: appendix,
          },
        }),
        onLateSettle,
      );
    },
    [client],
  );

  return { cancelLimitOrder, cancelTriggerOrder, cancelTriggerProductOrders, closePosition, isReady: !!client };
}
