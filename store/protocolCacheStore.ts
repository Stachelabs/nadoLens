import { create } from 'zustand'
import type { MarketSnapshot } from '@/lib/schemas/nado'

const CACHE_TTL = 300_000 // 5 minutes — matches server ISR (revalidate=300)

interface SnapshotBucket {
  data: MarketSnapshot[]
  fetchedAt: number
}

type ProtocolCacheStore = {
  buckets: Record<number, SnapshotBucket>
  prefetched: boolean

  setSnapshots: (granularity: number, data: MarketSnapshot[]) => void
  isStale: (granularity: number) => boolean
  invalidate: (granularity?: number) => void
  setPrefetched: () => void
}

const inflight = new Map<string, Promise<MarketSnapshot[]>>()

export function getInflight(key: string): Promise<MarketSnapshot[]> | undefined {
  return inflight.get(key)
}

export function setInflight(key: string, promise: Promise<MarketSnapshot[]>): void {
  inflight.set(key, promise)
  promise.finally(() => inflight.delete(key))
}

export function getSnapshotsFromBucket(
  bucket: SnapshotBucket | undefined,
  count: number,
): MarketSnapshot[] | null {
  if (!bucket) return null
  if (Date.now() - bucket.fetchedAt > CACHE_TTL) return null
  if (bucket.data.length < count) return null
  return bucket.data.slice(0, count)
}

export const useProtocolCacheStore = create<ProtocolCacheStore>((set, get) => ({
  buckets: {},
  prefetched: false,

  setSnapshots: (granularity, data) => {
    const existing = get().buckets[granularity]
    if (
      existing &&
      existing.data.length >= data.length &&
      Date.now() - existing.fetchedAt <= CACHE_TTL
    ) {
      return
    }
    set({
      buckets: {
        ...get().buckets,
        [granularity]: { data, fetchedAt: Date.now() },
      },
    })
  },

  isStale: (granularity) => {
    const bucket = get().buckets[granularity]
    if (!bucket) return true
    return Date.now() - bucket.fetchedAt > CACHE_TTL
  },

  invalidate: (granularity) => {
    if (granularity != null) {
      const next = { ...get().buckets }
      delete next[granularity]
      set({ buckets: next })
    } else {
      set({ buckets: {} })
    }
  },

  setPrefetched: () => set({ prefetched: true }),
}))
