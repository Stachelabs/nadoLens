import { create } from 'zustand'
import type { TradeMatch } from '@/types/nado'

const MAX_CACHED_WALLETS = 2

export type PositionMatchesCacheEntry = {
  positionTrades: TradeMatch[]
  positionOpenTimeMap: Record<string, number>
  cachedAt: number
}

type PositionMatchesCacheState = {
  wallets: Map<string, PositionMatchesCacheEntry>
  setCache: (addr: string, data: Omit<PositionMatchesCacheEntry, 'cachedAt'>) => void
  getCache: (addr: string) => PositionMatchesCacheEntry | undefined
  trimCache: (protectedAddr: string | null) => void
}

export const usePositionMatchesCacheStore = create<PositionMatchesCacheState>((set, get) => ({
  wallets: new Map(),

  setCache: (addr, data) => {
    set(prev => {
      const next = new Map(prev.wallets)
      next.set(addr, { ...data, cachedAt: Date.now() })
      return { wallets: next }
    })
  },

  getCache: (addr) => {
    return get().wallets.get(addr)
  },

  trimCache: (protectedAddr) => {
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
