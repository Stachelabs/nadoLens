import { create } from 'zustand'

type WalletAnalyticsStore = {
  activeTab: 'trading' | 'analytics'
  setActiveTab: (tab: 'trading' | 'analytics') => void
  selectedFundingProductId: number | null
  setSelectedFundingProductId: (id: number | null) => void
}

export const useWalletAnalyticsStore = create<WalletAnalyticsStore>((set) => ({
  activeTab: 'trading',
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedFundingProductId: null,
  setSelectedFundingProductId: (selectedFundingProductId) => set({ selectedFundingProductId }),
}))
