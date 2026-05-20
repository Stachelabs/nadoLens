import { create } from 'zustand'

type WalletAnalyticsStore = {
  activeTab: 'overview' | 'trading' | 'analytics'
  setActiveTab: (tab: 'overview' | 'trading' | 'analytics') => void
  selectedFundingProductId: number | null
  setSelectedFundingProductId: (id: number | null) => void
}

export const useWalletAnalyticsStore = create<WalletAnalyticsStore>((set) => ({
  activeTab: 'overview',
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedFundingProductId: null,
  setSelectedFundingProductId: (selectedFundingProductId) => set({ selectedFundingProductId }),
}))
