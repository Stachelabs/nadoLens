"use client";

import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { useAirdropStore } from "@/store/airdropStore";
import { cn } from "@/lib/utils";
import { Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { z } from "zod";

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const EpochSchema = z.object({
  epoch: z.number(),
  description: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  totalPoints: z.number(),
  points: z.number(),
  rank: z.number(),
  tier: z.number(),
  tierName: z.string(),
});

const AirdropResponseSchema = z.object({
  points: z
    .object({
      allTimePoints: z.number(),
      allTimeRank: z.number(),
      allTimeTier: z.number(),
      allTimeTierName: z.string(),
      epochs: z.array(EpochSchema),
    })
    .nullable(),
  inkAmount: z.string().nullable(),
  totalVolume: z.number().nullable(),
  volumeByProduct: z
    .array(z.object({ productId: z.number(), volume: z.number() }))
    .nullable(),
  errors: z.array(z.string()),
});

export function AirdropSearch() {
  const { address: connectedAddress } = useAccount();
  const storeAddress = useAirdropStore((s) => s.address);
  const setAddress = useAirdropStore((s) => s.setAddress);
  const setAirdropData = useAirdropStore((s) => s.setAirdropData);
  const setLoading = useAirdropStore((s) => s.setLoading);
  const setError = useAirdropStore((s) => s.setError);

  const [inputValue, setInputValue] = useState(storeAddress);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);

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
      const gen = ++genRef.current;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/airdrop?address=${addr}`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15_000),
          ]),
        });
        if (gen !== genRef.current) return;

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        const raw: unknown = await res.json();
        const parsed = AirdropResponseSchema.safeParse(raw);
        if (!parsed.success) {
          setError("Invalid response from server");
          return;
        }
        if (gen !== genRef.current) return;
        setAirdropData(parsed.data);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (gen !== genRef.current) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    },
    [setLoading, setError, setAirdropData],
  );

  useEffect(() => {
    if (storeAddress && ETH_ADDRESS_RE.test(storeAddress)) {
      fetchAirdrop(storeAddress);
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [storeAddress, fetchAirdrop]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (ETH_ADDRESS_RE.test(trimmed)) {
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
