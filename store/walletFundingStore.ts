import { create } from 'zustand'
import type { FundingPaymentEntry } from '@/lib/wallet/buildEquityCurve'
import type { EquityPeriod } from '@/lib/wallet/equityPeriod'
import { getPeriodBoundsUtc } from '@/lib/wallet/equityPeriod'
import { fromX18BigInt } from '@/types/nado'
import { usePairsStore } from '@/store/pairsStore'
import {
  fetchFundingBySubaccount,
} from '@/lib/wallet/fetchWalletFunding'

// ─── Per-address state ──────────────────────────────────────────────────────

export type PerAddressFundingState = {
  subaccounts: string[]
  subaccountCursors: Record<string, string | null>

  fundingPayments: FundingPaymentEntry[]
  fundingPaidUsd: number

  positionFundingPayments: FundingPaymentEntry[]
  positionFundingComplete: boolean
  positionFundingProductIds: number[]
  lastPositionFundingFetch: number

  globalFundingLoading: boolean
  globalFundingComplete: boolean
  fundingPeriodLoading: boolean
  fundingLoadedSince: number
}

const INITIAL_FUNDING_STATE: PerAddressFundingState = {
  subaccounts: [],
  subaccountCursors: {},
  fundingPayments: [],
  fundingPaidUsd: 0,
  positionFundingPayments: [],
  positionFundingComplete: false,
  positionFundingProductIds: [],
  lastPositionFundingFetch: 0,
  globalFundingLoading: false,
  globalFundingComplete: false,
  fundingPeriodLoading: false,
  fundingLoadedSince: Infinity,
}

// ─── Module-level AbortControllers + inflight dedup (keyed by address) ──────

const abortControllers = new Map<string, AbortController>()
const inflight = new Map<string, Promise<void>>()

function getSignal(addr: string): AbortSignal | undefined {
  return abortControllers.get(addr)?.signal
}

function getInflight(key: string): Promise<void> | undefined {
  return inflight.get(key)
}

function setInflight(key: string, promise: Promise<void>): void {
  inflight.set(key, promise)
  promise.catch(() => {}).finally(() => inflight.delete(key))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ensurePerpProductIds(): Promise<number[]> {
  let { perp } = usePairsStore.getState()
  if (perp.length === 0) {
    await usePairsStore.getState().init()
    perp = usePairsStore.getState().perp
  }
  if (perp.length === 0) {
    console.warn('ensurePerpProductIds: pairsStore still empty after init')
    return []
  }
  return Array.from(new Set(perp.map(a => a.product_id)))
}

const MAX_CACHED_WALLETS = 2

// ─── Store ──────────────────────────────────────────────────────────────────

type WalletFundingState = {
  wallets: Map<string, PerAddressFundingState>
  activeAddress: string | null

  ensureSlot: (addr: string) => void
  setActive: (addr: string) => void
  forActive: () => PerAddressFundingState | undefined
  forAddress: (addr: string) => PerAddressFundingState | undefined

  setSubaccounts: (addr: string, subs: string[]) => void
  setPositionFunding: (addr: string, payments: FundingPaymentEntry[], productIds: number[]) => void
  loadGlobalFunding: (addr: string) => Promise<void>
  loadFundingForPeriod: (addr: string, period: EquityPeriod) => Promise<void>
  abortAddress: (addr: string) => void
  trimCache: (protectedAddr: string | null) => void
}

function updateSlot(
  wallets: Map<string, PerAddressFundingState>,
  addr: string,
  updater: (prev: PerAddressFundingState) => Partial<PerAddressFundingState>,
): Map<string, PerAddressFundingState> {
  const next = new Map(wallets)
  const prev = next.get(addr) ?? { ...INITIAL_FUNDING_STATE }
  next.set(addr, { ...prev, ...updater(prev) })
  return next
}

export const useWalletFundingStore = create<WalletFundingState>((set, get) => ({
  wallets: new Map(),
  activeAddress: null,

  ensureSlot: (addr: string) => {
    const { wallets } = get()
    if (wallets.has(addr)) {
      abortControllers.get(addr)?.abort()
      abortControllers.set(addr, new AbortController())
      for (const key of inflight.keys()) {
        if (key.startsWith(`${addr}:`)) inflight.delete(key)
      }
      return
    }
    abortControllers.set(addr, new AbortController())
    const next = new Map(wallets)
    next.set(addr, { ...INITIAL_FUNDING_STATE })
    set({ wallets: next })
    get().trimCache(addr)
  },

  setActive: (addr: string) => {
    set({ activeAddress: addr })
  },

  forActive: () => {
    const { wallets, activeAddress } = get()
    if (!activeAddress) return undefined
    return wallets.get(activeAddress)
  },

  forAddress: (addr: string) => {
    return get().wallets.get(addr)
  },

  setSubaccounts: (addr: string, subs: string[]) => {
    set(prev => ({ wallets: updateSlot(prev.wallets, addr, () => ({ subaccounts: subs })) }))
  },

  setPositionFunding: (addr: string, payments: FundingPaymentEntry[], productIds: number[]) => {
    if (!get().wallets.has(addr)) return
    set(prev => ({
      wallets: updateSlot(prev.wallets, addr, () => ({
        positionFundingPayments: payments,
        positionFundingComplete: true,
        positionFundingProductIds: productIds,
        lastPositionFundingFetch: Date.now(),
      })),
    }))
  },

  loadGlobalFunding: async (addr: string) => {
    const slot = get().wallets.get(addr)
    if (!slot || slot.subaccounts.length === 0) return

    const key = `${addr}:global`
    const existing = getInflight(key)
    if (existing) return existing

    const promise = (async () => {
      set(prev => ({ wallets: updateSlot(prev.wallets, addr, () => ({ globalFundingLoading: true })) }))

      try {
        const productIds = await ensurePerpProductIds()
        if (productIds.length === 0) {
          set(prev => ({ wallets: updateSlot(prev.wallets, addr, () => ({ globalFundingLoading: false })) }))
          return
        }

        const currentSlot = get().wallets.get(addr)
        if (!currentSlot) return
        const { subaccountCursors, fundingPayments: existingPayments, subaccounts } = currentSlot
        const existingKeys = new Set(existingPayments.map(p => `${p.subaccount}:${p.idx}:${p.product_id}`))
        const newPayments: FundingPaymentEntry[] = []
        let newUsd = 0
        let allComplete = true
        let rateLimited = false
        const updatedCursors = { ...subaccountCursors }

        for (let i = 0; i < subaccounts.length; i++) {
          if (abortControllers.get(addr)?.signal.aborted) break
          const sub = subaccounts[i]!
          const cursor = subaccountCursors[sub]
          if (cursor === null) continue

          const result = await fetchFundingBySubaccount(
            sub, productIds, { resumeFromIdx: cursor }, getSignal(addr),
          )

          if (result.nextMaxIdx !== undefined) {
            updatedCursors[sub] = result.nextMaxIdx
          }

          for (const p of result.payments) {
            const dedupKey = `${p.subaccount}:${p.idx}:${p.product_id}`
            if (!existingKeys.has(dedupKey)) {
              existingKeys.add(dedupKey)
              newPayments.push(p)
              newUsd += fromX18BigInt(p.amount)
            }
          }

          if (!result.complete) allComplete = false
          if (result.rateLimited) { rateLimited = true; break }
          if (i < subaccounts.length - 1) {
            await new Promise(r => setTimeout(r, 220))
          }
        }

        if (!get().wallets.has(addr)) return

        const globalComplete = allComplete && !rateLimited
        set(prev => ({
          wallets: updateSlot(prev.wallets, addr, (s) => ({
            subaccountCursors: updatedCursors,
            fundingPayments: [...s.fundingPayments, ...newPayments],
            fundingPaidUsd: s.fundingPaidUsd + newUsd,
            globalFundingComplete: globalComplete,
            globalFundingLoading: false,
            fundingLoadedSince: globalComplete ? 0 : s.fundingLoadedSince,
          })),
        }))
      } catch (e) {
        if (get().wallets.has(addr)) {
          set(prev => ({ wallets: updateSlot(prev.wallets, addr, () => ({ globalFundingLoading: false })) }))
        }
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error('loadGlobalFunding failed:', e)
        }
      }
    })()

    setInflight(key, promise)
    return promise
  },

  loadFundingForPeriod: async (addr: string, period: EquityPeriod) => {
    const slot = get().wallets.get(addr)
    if (!slot || slot.subaccounts.length === 0) return
    if (slot.globalFundingLoading) return

    const bounds = getPeriodBoundsUtc(period)
    const stopBeforeMs = bounds ? bounds.startSec * 1000 : undefined

    const already =
      period === 'All time'
        ? slot.fundingLoadedSince === 0
        : slot.fundingLoadedSince !== Infinity &&
          slot.fundingLoadedSince <= (stopBeforeMs ?? 0)
    if (already) return

    const key = `${addr}:period:${period}`
    const existing = getInflight(key)
    if (existing) return existing

    const promise = (async () => {
      set(prev => ({ wallets: updateSlot(prev.wallets, addr, () => ({ fundingPeriodLoading: true })) }))

      try {
        const productIds = await ensurePerpProductIds()
        if (productIds.length === 0) {
          set(prev => ({ wallets: updateSlot(prev.wallets, addr, () => ({ fundingPeriodLoading: false })) }))
          return
        }

        const currentSlot = get().wallets.get(addr)
        if (!currentSlot) return
        const { subaccountCursors, fundingPayments: existingPayments, subaccounts } = currentSlot
        const existingKeys = new Set(existingPayments.map(p => `${p.subaccount}:${p.idx}:${p.product_id}`))
        const newPayments: FundingPaymentEntry[] = []
        let rateLimited = false
        const updatedCursors = { ...subaccountCursors }

        for (let i = 0; i < subaccounts.length; i++) {
          if (abortControllers.get(addr)?.signal.aborted) break
          const sub = subaccounts[i]!
          const cursor = updatedCursors[sub]

          const result = await fetchFundingBySubaccount(
            sub, productIds, { stopBeforeMs, resumeFromIdx: cursor }, getSignal(addr),
          )

          if (result.nextMaxIdx !== undefined) {
            updatedCursors[sub] = result.nextMaxIdx
          }

          for (const p of result.payments) {
            const dedupKey = `${p.subaccount}:${p.idx}:${p.product_id}`
            if (!existingKeys.has(dedupKey)) {
              existingKeys.add(dedupKey)
              newPayments.push(p)
            }
          }

          if (result.rateLimited) { rateLimited = true; break }
          if (i < subaccounts.length - 1) {
            await new Promise(r => setTimeout(r, 220))
          }
        }

        if (!get().wallets.has(addr)) return

        let newUsd = 0
        for (const p of newPayments) {
          newUsd += fromX18BigInt(p.amount)
        }

        const allExhausted = !rateLimited && subaccounts.every(
          s => updatedCursors[s] === null,
        )
        const loadedSince = allExhausted ? 0 : (stopBeforeMs ?? 0)

        set(prev => ({
          wallets: updateSlot(prev.wallets, addr, (s) => ({
            subaccountCursors: updatedCursors,
            fundingPayments: [...s.fundingPayments, ...newPayments],
            fundingPaidUsd: s.fundingPaidUsd + newUsd,
            fundingPeriodLoading: false,
            fundingLoadedSince: loadedSince,
            globalFundingComplete: loadedSince === 0,
          })),
        }))
      } catch (e) {
        if (get().wallets.has(addr)) {
          set(prev => ({ wallets: updateSlot(prev.wallets, addr, () => ({ fundingPeriodLoading: false })) }))
        }
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error('loadFundingForPeriod failed:', e)
        }
      }
    })()

    setInflight(key, promise)
    return promise
  },

  abortAddress: (addr: string) => {
    abortControllers.get(addr)?.abort()
    abortControllers.delete(addr)
    // Clear inflight for this address only
    for (const key of inflight.keys()) {
      if (key.startsWith(`${addr}:`)) {
        inflight.delete(key)
      }
    }
  },

  trimCache: (protectedAddr: string | null) => {
    const { wallets, activeAddress } = get()
    if (wallets.size <= MAX_CACHED_WALLETS) return
    const next = new Map(wallets)
    for (const [addr] of wallets) {
      if (next.size <= MAX_CACHED_WALLETS) break
      if (addr === activeAddress || addr === protectedAddr) continue
      next.delete(addr)
      abortControllers.get(addr)?.abort()
      abortControllers.delete(addr)
    }
    set({ wallets: next })
  },
}))
