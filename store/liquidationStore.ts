import { create } from 'zustand'
import type { LiquidationEvent } from '@/types/nado'

const MAX_EVENTS = 500

interface LiquidationStore {
  events: LiquidationEvent[]
  addEvent: (event: LiquidationEvent) => void
  setInitialEvents: (events: LiquidationEvent[]) => void
  clear: () => void
}

export const useLiquidationStore = create<LiquidationStore>((set) => ({
  events: [],
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
    })),
  setInitialEvents: (events) =>
    set((state) => ({
      // Merge initial events — live events (if any) take priority at the top
      events: [...state.events, ...events].slice(0, MAX_EVENTS),
    })),
  clear: () => set({ events: [] }),
}))
