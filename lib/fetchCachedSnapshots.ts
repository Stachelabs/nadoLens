import { z } from 'zod'
import { MarketSnapshotSchema, type MarketSnapshot } from '@/lib/schemas/nado'
import {
  useProtocolCacheStore,
  getSnapshotsFromBucket,
  getInflight,
  setInflight,
} from '@/store/protocolCacheStore'

const MarketSnapshotsArraySchema = z.array(MarketSnapshotSchema)

const CANONICAL_COUNTS: Record<number, number> = {
  86400: 92,
  3600: 25,
  604800: 100,
  7776000: 2,
}

export async function fetchCachedSnapshots(
  count: number,
  granularity: number,
  signal?: AbortSignal,
  options?: { upgradeToCanonical?: boolean },
): Promise<MarketSnapshot[]> {
  const state = useProtocolCacheStore.getState()
  const cached = getSnapshotsFromBucket(state.buckets[granularity], count)
  if (cached) return cached

  const fetchCount =
    options?.upgradeToCanonical
      ? Math.max(count, CANONICAL_COUNTS[granularity] ?? count)
      : count

  const key = `${granularity}:${fetchCount}`
  const existing = getInflight(key)
  if (existing) {
    const data = await existing
    return count < data.length ? data.slice(-count) : data
  }

  const promise = (async (): Promise<MarketSnapshot[]> => {
    const res = await fetch(
      `/api/protocol/market-snapshots?count=${fetchCount}&granularity=${granularity}`,
      { signal },
    )
    if (!res.ok) throw new Error(`Failed to load snapshots: ${res.status}`)

    const raw: unknown = await res.json()
    const parsed = MarketSnapshotsArraySchema.safeParse(raw)
    if (!parsed.success) throw new Error('Invalid snapshots data')

    useProtocolCacheStore.getState().setSnapshots(granularity, parsed.data)
    return parsed.data
  })()

  setInflight(key, promise)
  const data = await promise
  return count < data.length ? data.slice(-count) : data
}
