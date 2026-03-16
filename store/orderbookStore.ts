import { create } from 'zustand'
import type { OrderbookLevel, OrderbookState } from '@/types/nado'

interface OrderbookStore extends OrderbookState {
  setOrderbook: (bids: OrderbookLevel[], asks: OrderbookLevel[]) => void
  applyDiff: (
    bidUpdates: OrderbookLevel[],
    askUpdates: OrderbookLevel[],
  ) => void
  clear: () => void
}

function applyLevelUpdates(
  levels: OrderbookLevel[],
  updates: OrderbookLevel[],
): OrderbookLevel[] {
  const map = new Map<number, OrderbookLevel>(
    levels.map((l) => [l.price, l]),
  )
  for (const u of updates) {
    if (u.size === 0) {
      map.delete(u.price)
    } else {
      map.set(u.price, u)
    }
  }
  return Array.from(map.values())
}

export const useOrderbookStore = create<OrderbookStore>((set) => ({
  bids: [],
  asks: [],
  lastUpdateMs: 0,
  setOrderbook: (bids, asks) =>
    set({ bids, asks, lastUpdateMs: Date.now() }),
  applyDiff: (bidUpdates, askUpdates) =>
    set((state) => ({
      bids: applyLevelUpdates(state.bids, bidUpdates).sort(
        (a, b) => b.price - a.price,
      ),
      asks: applyLevelUpdates(state.asks, askUpdates).sort(
        (a, b) => a.price - b.price,
      ),
      lastUpdateMs: Date.now(),
    })),
  clear: () => set({ bids: [], asks: [], lastUpdateMs: 0 }),
}))
