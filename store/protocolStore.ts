import { create } from 'zustand'
import type { EnrichedTicker, LiquidationFeedEntry } from '@/lib/schemas/nado'

export type ProtocolTab = 'overview' | 'volumes' | 'oi-funding' | 'revenue' | 'tvl'
export type OverviewTimeframe = '24 Hours' | '7 Days' | '30 Days' | '60 Days' | '90 Days' | 'All Time'

type ProtocolStore = {
  activeTab: ProtocolTab
  setActiveTab: (tab: ProtocolTab) => void
  overviewTimeframe: OverviewTimeframe
  setOverviewTimeframe: (tf: OverviewTimeframe) => void
  tickers: EnrichedTicker[]
  tickersLoading: boolean
  tickersError: string | null
  setTickers: (tickers: EnrichedTicker[]) => void
  setTickersLoading: (v: boolean) => void
  setTickersError: (e: string | null) => void
  liquidations: LiquidationFeedEntry[]
  liquidationsLoading: boolean
  setLiquidations: (l: LiquidationFeedEntry[]) => void
  setLiquidationsLoading: (v: boolean) => void
}

export const useProtocolStore = create<ProtocolStore>((set) => ({
  activeTab: 'overview',
  setActiveTab: (activeTab) => set({ activeTab }),
  overviewTimeframe: '30 Days',
  setOverviewTimeframe: (overviewTimeframe) => set({ overviewTimeframe }),
  tickers: [],
  tickersLoading: true,
  tickersError: null,
  setTickers: (tickers) => set({ tickers, tickersLoading: false, tickersError: null }),
  setTickersLoading: (tickersLoading) => set({ tickersLoading }),
  setTickersError: (tickersError) => set({ tickersError, tickersLoading: false }),
  liquidations: [],
  liquidationsLoading: false,
  setLiquidations: (liquidations) => set({ liquidations, liquidationsLoading: false }),
  setLiquidationsLoading: (liquidationsLoading) => set({ liquidationsLoading }),
}))
