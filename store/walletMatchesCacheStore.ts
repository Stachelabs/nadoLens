import { create } from 'zustand'
import type { TradeMatch } from '@/types/nado'

const MAX_CACHED_WALLETS = 2

export type MatchesCacheEntry = {
  trades: TradeMatch[]
  latestKnownIdx: string | null
  seenTradeIds: Set<string>
  globalMatchesComplete: boolean
  cachedAt: number
}

type WalletMatchesCacheState = {
  wallets: Map<string, MatchesCacheEntry>
  setCache: (addr: string, data: Partial<MatchesCacheEntry>) => void
  getCache: (addr: string) => MatchesCacheEntry | undefined
  trimCache: (protectedAddr: string | null) => void
}

export const useWalletMatchesCacheStore = create<WalletMatchesCacheState>((set, get) => ({
  wallets: new Map(),

  setCache: (addr: string, data: Partial<MatchesCacheEntry>) => {
    set(prev => {
      const next = new Map(prev.wallets)
      const existing = next.get(addr)
      next.set(addr, {
        trades: data.trades ?? existing?.trades ?? [],
        latestKnownIdx: data.latestKnownIdx ?? existing?.latestKnownIdx ?? null,
        seenTradeIds: data.seenTradeIds ?? existing?.seenTradeIds ?? new Set(),
        globalMatchesComplete: data.globalMatchesComplete ?? existing?.globalMatchesComplete ?? false,
        cachedAt: Date.now(),
      })
      return { wallets: next }
    })
  },

  getCache: (addr: string) => {
    return get().wallets.get(addr)
  },

  trimCache: (protectedAddr: string | null) => {
    const { wallets } = get()
    if (wallets.size <= MAX_CACHED_WALLETS) return
    const next = new Map(wallets)
    for (const [addr] of wallets) {
      if (next.size <= MAX_CACHED_WALLETS) break
      if (addr === protectedAddr) continue
      next.delete(addr)
    }
    set({ wallets: next })
  },
}))
