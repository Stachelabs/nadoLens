import { create } from 'zustand'
import type { OIBucket } from '@/types/nado'

interface OIStore {
  buckets: OIBucket[]
  setBuckets: (buckets: OIBucket[]) => void
  clear: () => void
}

export const useOIStore = create<OIStore>((set) => ({
  buckets: [],
  setBuckets: (buckets) => set({ buckets }),
  clear: () => set({ buckets: [] }),
}))
