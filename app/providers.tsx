"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState } from "wagmi";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/lib/wagmi";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { usePairs } from "@/hooks/usePairs";
import { useProtocolPrefetch } from "@/hooks/useProtocolPrefetch";
import { useConnectedWalletPrefetch } from "@/hooks/useConnectedWalletPrefetch";

function PairsInitializer() {
  usePairs();
  return null;
}

function ProtocolPrefetchInitializer() {
  useProtocolPrefetch();
  return null;
}

function ConnectedWalletPrefetchInitializer() {
  useConnectedWalletPrefetch();
  return null;
}

import "@rainbow-me/rainbowkit/styles.css";

export function Providers({
  children,
  cookie,
}: {
  children: React.ReactNode;
  cookie?: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const { resolvedTheme } = useTheme();
  const initialState = cookieToInitialState(wagmiConfig, cookie ?? undefined);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rkTheme = useMemo(
    () =>
      mounted && resolvedTheme === "light"
        ? lightTheme({ accentColor: "#a855f7" })
        : darkTheme({ accentColor: "#a855f7" }),
    [mounted, resolvedTheme],
  );

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en" coolMode theme={rkTheme}>
          <PairsInitializer />
          <ProtocolPrefetchInitializer />
          <ConnectedWalletPrefetchInitializer />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
