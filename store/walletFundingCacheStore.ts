import { create } from 'zustand'
import type { FundingPaymentEntry } from '@/lib/wallet/buildEquityCurve'

const MAX_CACHED_WALLETS = 2
const STALE_TTL_MS = 5 * 60 * 1000

export type FundingCacheEntry = {
  payments: FundingPaymentEntry[]
  totalFundingUsd: number
  globalFundingComplete: boolean
  cachedAt: number
  subaccountCursors: Record<string, string | null>
  fundingLoadedSince: number
}

type WalletFundingCacheState = {
  wallets: Map<string, FundingCacheEntry>
  setCache: (addr: string, data: Partial<FundingCacheEntry>) => void
  getCache: (addr: string) => FundingCacheEntry | undefined
  isStale: (addr: string) => boolean
  trimCache: (protectedAddr: string | null) => void
}

export const useWalletFundingCacheStore = create<WalletFundingCacheState>((set, get) => ({
  wallets: new Map(),

  setCache: (addr: string, data: Partial<FundingCacheEntry>) => {
    set(prev => {
      const next = new Map(prev.wallets)
      const existing = next.get(addr)
      next.set(addr, {
        payments: data.payments ?? existing?.payments ?? [],
        totalFundingUsd: data.totalFundingUsd ?? existing?.totalFundingUsd ?? 0,
        globalFundingComplete: data.globalFundingComplete ?? existing?.globalFundingComplete ?? false,
        cachedAt: Date.now(),
        subaccountCursors: data.subaccountCursors ?? existing?.subaccountCursors ?? {},
        fundingLoadedSince: data.fundingLoadedSince ?? existing?.fundingLoadedSince ?? Infinity,
      })
      if (next.size > MAX_CACHED_WALLETS) {
        for (const [key] of next) {
          if (next.size <= MAX_CACHED_WALLETS) break
          if (key === addr) continue
          next.delete(key)
        }
      }
      return { wallets: next }
    })
  },

  getCache: (addr: string) => {
    return get().wallets.get(addr)
  },

  isStale: (addr: string) => {
    const entry = get().wallets.get(addr)
    if (!entry) return true
    return Date.now() - entry.cachedAt > STALE_TTL_MS
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
