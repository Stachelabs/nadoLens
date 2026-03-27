import { create } from 'zustand'
import type { AccountHealth, Position } from '@/types/nado'

type AccountStore = {
  health: AccountHealth | null
  positions: Position[]
  address: string | null
  setHealth: (health: AccountHealth) => void
  setPositions: (positions: Position[]) => void
  setAddress: (address: string) => void
  clear: () => void
}

export const useAccountStore = create<AccountStore>((set) => ({
  health: null,
  positions: [],
  address: null,
  setHealth: (health) => set({ health }),
  setPositions: (positions) => set({ positions }),
  setAddress: (address) => set({ address }),
  clear: () => set({ health: null, positions: [], address: null }),
}))
