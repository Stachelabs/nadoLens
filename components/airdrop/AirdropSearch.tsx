"use client";

import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { useAirdropStore } from "@/store/airdropStore";
import { cn } from "@/lib/utils";
import { Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

export function AirdropSearch() {
  const { address: connectedAddress } = useAccount();
  const storeAddress = useAirdropStore((s) => s.address);
  const setAddress = useAirdropStore((s) => s.setAddress);
  const setAirdropData = useAirdropStore((s) => s.setAirdropData);
  const setLoading = useAirdropStore((s) => s.setLoading);
  const setError = useAirdropStore((s) => s.setError);

  const [inputValue, setInputValue] = useState(storeAddress);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (connectedAddress && !storeAddress) {
      setInputValue(connectedAddress);
      setAddress(connectedAddress);
    }
  }, [connectedAddress, storeAddress, setAddress]);

  const fetchAirdrop = useCallback(
    async (addr: string) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/airdrop?address=${addr}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        const data = await res.json();
        setAirdropData(data);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    },
    [setLoading, setError, setAirdropData],
  );

  useEffect(() => {
    if (storeAddress && /^0x[a-fA-F0-9]{40}$/.test(storeAddress)) {
      fetchAirdrop(storeAddress);
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [storeAddress, fetchAirdrop]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setAddress(trimmed);
    } else {
      setError("Invalid Ethereum address");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Wallet className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="0x... wallet address"
          className="pl-10 font-mono text-sm"
        />
      </div>
      <button
        type="submit"
        className={cn(
          buttonVariants({ variant: "default", size: "default" }),
          "gap-1.5",
        )}
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Lookup</span>
      </button>
    </form>
  );
}
