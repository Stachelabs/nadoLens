"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/lib/wagmi";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { usePairs } from "@/hooks/usePairs";

function PairsInitializer() {
  usePairs();
  return null;
}

import "@rainbow-me/rainbowkit/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // This hydration guard is intentional for next-themes/RainbowKit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          locale="en"
          coolMode
          theme={
            resolvedTheme === "light"
              ? lightTheme({ accentColor: "#a855f7" })
              : darkTheme({ accentColor: "#a855f7" })
          }
        >
          <PairsInitializer />
          {mounted ? children : null}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
