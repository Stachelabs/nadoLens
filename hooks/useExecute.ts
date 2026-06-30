"use client";

import { useNadoClient } from "@/hooks/useNadoClient";
import { packOrderAppendix } from "@nadohq/shared";
import { useCallback } from "react";

type CancelParams = {
  subaccountName: string;
  productId: number;
  digest: string;
};

type CloseParams = {
  subaccountName: string;
  productId: number;
  amountX18: string;
};

export function useExecute() {
  const client = useNadoClient();

  const cancelLimitOrder = useCallback(
    async (params: CancelParams) => {
      if (!client) throw new Error("Wallet not connected");
      return client.market.cancelOrders({
        subaccountName: params.subaccountName,
        productIds: [params.productId],
        digests: [params.digest],
      });
    },
    [client],
  );

  const cancelTriggerOrder = useCallback(
    async (params: CancelParams) => {
      if (!client) throw new Error("Wallet not connected");
      return client.market.cancelTriggerOrders({
        subaccountName: params.subaccountName,
        productIds: [params.productId],
        digests: [params.digest],
      });
    },
    [client],
  );

  const closePosition = useCallback(
    async (params: CloseParams) => {
      if (!client) throw new Error("Wallet not connected");
      const appendix = packOrderAppendix({
        reduceOnly: true,
        orderExecutionType: "ioc",
      });
      return client.market.placeOrder({
        productId: params.productId,
        order: {
          subaccountName: params.subaccountName,
          price: "0",
          amount: params.amountX18,
          expiration: String(Math.floor(Date.now() / 1000) + 90),
          appendix: String(appendix),
        },
      });
    },
    [client],
  );

  return { cancelLimitOrder, cancelTriggerOrder, closePosition, isReady: !!client };
}
