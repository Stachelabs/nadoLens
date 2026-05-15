import { create } from 'zustand'
import type { FundingPaymentEntry } from '@/lib/wallet/buildEquityCurve'
import type { EquityPeriod } from '@/lib/wallet/equityPeriod'
import { getPeriodBoundsUtc } from '@/lib/wallet/equityPeriod'
import { fromX18BigInt } from '@/types/nado'
import { usePairsStore } from '@/store/pairsStore'
import {
  fetchFundingBySubaccount,
  fetchFundingAllSubaccounts,
  type FundingFetchResult,
} from '@/lib/wallet/fetchWalletFunding'

// ─── Inflight dedup (same pattern as protocolCacheStore.ts) ──────────────────

const inflight = new Map<string, Promise<void>>()

function getInflight(key: string): Promise<void> | undefined {
  return inflight.get(key)
}

function setInflight(key: string, promise: Promise<void>): void {
  inflight.set(key, promise)
  promise.catch(() => {}).finally(() => inflight.delete(key))
}

// ─── Module-level AbortController per wallet address ─────────────────────────

let abortController: AbortController | null = null

function getSignal(): AbortSignal | undefined {
  return abortController?.signal
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAllPerpProductIds(): number[] {
  const { perp } = usePairsStore.getState()
  return Array.from(new Set(perp.map(a => a.product_id)))
}

// ─── Store ───────────────────────────────────────────────────────────────────

type WalletFundingState = {
  address: string | null
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

  loadedProductIds: number[]

  initForAddress: (addr: string) => void
  setSubaccounts: (subs: string[]) => void
  setPositionFunding: (payments: FundingPaymentEntry[], productIds: number[]) => void
  loadGlobalFunding: () => Promise<void>
  loadFundingForPeriod: (period: EquityPeriod) => Promise<void>
  loadFundingForProducts: (productIds: number[]) => Promise<void>
  abort: () => void
}

const INITIAL_FUNDING_STATE = {
  subaccountCursors: {} as Record<string, string | null>,
  fundingPayments: [] as FundingPaymentEntry[],
  fundingPaidUsd: 0,
  positionFundingPayments: [] as FundingPaymentEntry[],
  positionFundingComplete: false,
  positionFundingProductIds: [] as number[],
  lastPositionFundingFetch: 0,
  globalFundingLoading: false,
  globalFundingComplete: false,
  fundingPeriodLoading: false,
  fundingLoadedSince: Infinity,
  loadedProductIds: [] as number[],
}

export const useWalletFundingStore = create<WalletFundingState>((set, get) => ({
  address: null,
  subaccounts: [],
  ...INITIAL_FUNDING_STATE,

  initForAddress: (addr: string) => {
    abortController?.abort()
    abortController = new AbortController()
    inflight.clear()
    set({ address: addr, subaccounts: [], ...INITIAL_FUNDING_STATE })
  },

  setSubaccounts: (subs: string[]) => {
    set({ subaccounts: subs })
  },

  setPositionFunding: (payments: FundingPaymentEntry[], productIds: number[]) => {
    set({
      positionFundingPayments: payments,
      positionFundingComplete: true,
      positionFundingProductIds: productIds,
      lastPositionFundingFetch: Date.now(),
    })
  },

  loadGlobalFunding: async () => {
    const { address, subaccounts } = get()
    if (!address || subaccounts.length === 0) return

    const key = `${address}:global`
    const existing = getInflight(key)
    if (existing) return existing

    const promise = (async () => {
      set({ globalFundingLoading: true })

      try {
        const productIds = getAllPerpProductIds()
        if (productIds.length === 0) {
          set({ globalFundingLoading: false })
          return
        }

        const { subaccountCursors, fundingPayments: existingPayments } = get()
        const existingKeys = new Set(existingPayments.map(p => `${p.subaccount}:${p.idx}`))
        const newPayments: FundingPaymentEntry[] = []
        let newUsd = 0
        let allComplete = true
        let rateLimited = false
        const updatedCursors = { ...subaccountCursors }

        for (const sub of subaccounts) {
          if (abortController?.signal.aborted) break
          const cursor = subaccountCursors[sub]
          if (cursor === null) continue

          const result = await fetchFundingBySubaccount(
            sub, productIds, { resumeFromIdx: cursor }, getSignal(),
          )

          if (result.nextMaxIdx !== undefined) {
            updatedCursors[sub] = result.nextMaxIdx
          }

          for (const p of result.payments) {
            const dedupKey = `${p.subaccount}:${p.idx}`
            if (!existingKeys.has(dedupKey)) {
              existingKeys.add(dedupKey)
              newPayments.push(p)
              newUsd += fromX18BigInt(p.amount)
            }
          }

          if (!result.complete) allComplete = false
          if (result.rateLimited) { rateLimited = true; break }
        }

        if (get().address !== address) return

        const globalComplete = allComplete && !rateLimited
        set(prev => ({
          subaccountCursors: updatedCursors,
          fundingPayments: [...prev.fundingPayments, ...newPayments],
          fundingPaidUsd: prev.fundingPaidUsd + newUsd,
          globalFundingComplete: globalComplete,
          globalFundingLoading: false,
          fundingLoadedSince: globalComplete ? 0 : prev.fundingLoadedSince,
        }))
      } catch (e) {
        if (get().address === address) {
          set({ globalFundingLoading: false })
        }
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error('loadGlobalFunding failed:', e)
        }
      }
    })()

    setInflight(key, promise)
    return promise
  },

  loadFundingForPeriod: async (period: EquityPeriod) => {
    const { address, subaccounts, fundingLoadedSince, globalFundingLoading } = get()
    if (!address || subaccounts.length === 0) return
    if (globalFundingLoading) return

    const bounds = getPeriodBoundsUtc(period)
    const stopBeforeMs = bounds ? bounds.startSec * 1000 : undefined

    const already =
      period === 'All time'
        ? fundingLoadedSince === 0
        : fundingLoadedSince !== Infinity &&
          fundingLoadedSince <= (stopBeforeMs ?? 0)
    if (already) return

    const key = `${address}:period:${period}`
    const existing = getInflight(key)
    if (existing) return existing

    const promise = (async () => {
      set({ fundingPeriodLoading: true })

      try {
        const productIds = getAllPerpProductIds()
        if (productIds.length === 0) {
          set({ fundingPeriodLoading: false })
          return
        }

        const { subaccountCursors, fundingPayments: existingPayments } = get()
        const existingKeys = new Set(existingPayments.map(p => `${p.subaccount}:${p.idx}`))
        const newPayments: FundingPaymentEntry[] = []
        let rateLimited = false
        const updatedCursors = { ...subaccountCursors }

        for (let i = 0; i < subaccounts.length; i++) {
          if (abortController?.signal.aborted) break
          const sub = subaccounts[i]!
          const cursor = updatedCursors[sub]

          const result = await fetchFundingBySubaccount(
            sub, productIds, { stopBeforeMs, resumeFromIdx: cursor }, getSignal(),
          )

          if (result.nextMaxIdx !== undefined) {
            updatedCursors[sub] = result.nextMaxIdx
          }

          for (const p of result.payments) {
            const dedupKey = `${p.subaccount}:${p.idx}`
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

        if (get().address !== address) return

        let newUsd = 0
        for (const p of newPayments) {
          newUsd += fromX18BigInt(p.amount)
        }

        const allExhausted = !rateLimited && subaccounts.every(
          s => updatedCursors[s] === null,
        )
        const loadedSince = allExhausted ? 0 : (stopBeforeMs ?? 0)

        set(prev => ({
          subaccountCursors: updatedCursors,
          fundingPayments: [...prev.fundingPayments, ...newPayments],
          fundingPaidUsd: prev.fundingPaidUsd + newUsd,
          fundingPeriodLoading: false,
          fundingLoadedSince: loadedSince,
          globalFundingComplete: loadedSince === 0,
        }))
      } catch (e) {
        if (get().address === address) {
          set({ fundingPeriodLoading: false })
        }
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error('loadFundingForPeriod failed:', e)
        }
      }
    })()

    setInflight(key, promise)
    return promise
  },

  loadFundingForProducts: async (productIds: number[]) => {
    const { address, subaccounts, loadedProductIds } = get()
    if (!address || subaccounts.length === 0) return

    const toLoad = productIds.filter(id => !loadedProductIds.includes(id))
    if (toLoad.length === 0) return

    const key = `${address}:products:${[...toLoad].sort().join(',')}`
    const existing = getInflight(key)
    if (existing) return existing

    const promise = (async () => {
      set({ globalFundingLoading: true })

      try {
        const result = await fetchFundingAllSubaccounts(subaccounts, toLoad, getSignal())

        if (get().address !== address) return

        const { fundingPayments: existingPayments } = get()
        const existingIdxs = new Set(existingPayments.map(p => p.idx))
        const newPayments = result.payments.filter(p => !existingIdxs.has(p.idx))

        set(prev => ({
          fundingPayments: [...prev.fundingPayments, ...newPayments],
          fundingPaidUsd: prev.fundingPaidUsd + result.totalFundingUsd,
          loadedProductIds: [...new Set([...prev.loadedProductIds, ...toLoad])],
          globalFundingLoading: false,
        }))
      } catch (e) {
        if (get().address === address) {
          set({ globalFundingLoading: false })
        }
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error('loadFundingForProducts failed:', e)
        }
      }
    })()

    setInflight(key, promise)
    return promise
  },

  abort: () => {
    abortController?.abort()
    abortController = null
    inflight.clear()
  },
}))
