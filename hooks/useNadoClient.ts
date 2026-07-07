"use client";

import { createNadoClient } from "@nadohq/client";
import { usePublicClient, useWalletClient } from "wagmi";
import { useMemo } from "react";

export function useNadoClient() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  return useMemo(() => {
    if (!walletClient || !publicClient) return null;
    if (walletClient.chain.id !== 57073) return null;
    return createNadoClient("inkMainnet", { walletClient, publicClient });
  }, [walletClient, publicClient]);
}
