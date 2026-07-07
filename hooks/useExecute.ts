"use client";

import { useNadoClient } from "@/hooks/useNadoClient";
import { packOrderAppendix } from "@nadohq/shared";
import { useCallback } from "react";

const SDK_TIMEOUT_MS = 30_000;
const ORDER_EXPIRY_S = 180;

type CancelParams = {
  subaccountName: string;
  productId: number;
  digest: string;
};

type CloseParams = {
  subaccountName: string;
  productId: number;
  amountX18: string;
  isLong: boolean;
  isolated: boolean;
};

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Request timed out")), SDK_TIMEOUT_MS);
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

  const closePosition = useCallback(
    async (params: CloseParams) => {
      if (!client) throw new Error("Wallet not connected");
      const appendix = packOrderAppendix({
        reduceOnly: true,
        orderExecutionType: "ioc",
        ...(params.isolated ? { isolated: { margin: BigInt(0) } } : {}),
      });
      return withTimeout(
        client.market.placeOrder({
          productId: params.productId,
          order: {
            subaccountName: params.subaccountName,
            price: params.isLong ? "0" : "999999999",
            amount: params.amountX18,
            expiration: String(Math.floor(Date.now() / 1000) + ORDER_EXPIRY_S),
            appendix: appendix,
          },
        }),
      );
    },
    [client],
  );

  return { cancelLimitOrder, cancelTriggerOrder, closePosition, isReady: !!client };
}
