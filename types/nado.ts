// ─── Utility ─────────────────────────────────────────────────────────────────

export const fromX18 = (val: string): number => parseFloat(val) / 1e18

// ─── Risk ─────────────────────────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'warning' | 'danger'

// ─── Re-exports from schemas (single source of truth) ────────────────────────

export type { NadoPair } from '@/lib/schemas/nado'

// ─── Account Health ───────────────────────────────────────────────────────────

export type AccountHealth = {
  health_score: number
  total_collateral_usd: number
  maintenance_margin: number
  maint_margin_usage: number
  available_margin: number
  total_notional: number
  risk_level: RiskLevel
  drop_tolerance: number
}

// ─── Positions ────────────────────────────────────────────────────────────────

export type Position = {
  product_id: number
  pair: string
  amount: number
  entry_price: number
  mark_price: number
  unrealized_pnl: number
  liquidation_price: number
  margin_used: number
  maint_weight: number
  isolated: boolean
}

// ─── Trade History ────────────────────────────────────────────────────────────

export type TradeMatch = {
  timestamp: string
  product_id: number
  pair: string
  amount: string   // x18
  price: string    // x18
  realized_pnl: string // x18
  closed_amount: string // x18
  fee: string
  side: 'long' | 'short'
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export type WalletStats = {
  address: string
  health_score: number
  total_equity_usd: number
  available_margin: number
  positions: Position[]
  trades: TradeMatch[]
  win_rate: number
  total_pnl_usd: number
  total_volume_usd: number
  avg_trade_size_usd: number
}
