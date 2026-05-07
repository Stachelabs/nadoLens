import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { V2AssetsResponseSchema } from '@/lib/schemas/nado'
import type { V2Asset } from '@/lib/schemas/nado'

const ONE_HOUR = 3_600_000

type PairsState = {
  assets: V2Asset[]             // persisted — JSON-serializable array
  byId: Map<number, string>     // not persisted — recomputed by init()
  perp: V2Asset[]               // not persisted — market_type === 'perp'
  spot: V2Asset[]               // not persisted — market_type === 'spot' | null
  lastFetched: number | null    // persisted — timestamp ms for TTL
  initialized: boolean          // not persisted
  error: string | null          // not persisted — fetch error message
  init: () => Promise<void>
}

function buildDerived(assets: V2Asset[]) {
  return {
    byId: new Map(assets.map((a) => [a.product_id, a.symbol])),
    perp: assets.filter((a) => a.market_type === 'perp'),
    spot: assets.filter((a) => a.market_type === 'spot' || a.market_type === null),
  }
}

export const usePairsStore = create<PairsState>()(
  persist(
    (set, get) => ({
      assets: [],
      byId: new Map(),
      perp: [],
      spot: [],
      lastFetched: null,
      initialized: false,
      error: null,

      init: async () => {
        const { assets, lastFetched } = get()

        // Rebuild derived state from current assets (covers localStorage hydration)
        if (assets.length > 0) {
          set({ ...buildDerived(assets), initialized: true })
        }

        // TTL: skip fetch if data is fresh
        if (lastFetched && Date.now() - lastFetched < ONE_HOUR) return

        try {
          const res = await fetch('/api/pairs')
          if (!res.ok) return
          const raw: unknown = await res.json()
          const result = V2AssetsResponseSchema.safeParse(raw)
          if (!result.success) return
          const fetched = result.data
          set({
            assets: fetched,
            ...buildDerived(fetched),
            lastFetched: Date.now(),
            initialized: true,
          })
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Failed to fetch pairs' })
        }
      },
    }),
    {
      name: 'nado-assets',
      partialize: (state) => ({
        assets: state.assets,
        lastFetched: state.lastFetched,
      }),
    },
  ),
)

/** Resolve a product_id to its symbol string (e.g. "BTC-PERP"). Safe to call outside React. */
export function productName(id: number): string {
  return usePairsStore.getState().byId.get(id) ?? `#${id}`
}
