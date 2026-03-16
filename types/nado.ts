// ─── Utility ────────────────────────────────────────────────────────────────

export const fromX18 = (val: string): number => parseFloat(val) / 1e18

// ─── Risk ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'warning' | 'danger'

// ─── Liquidation ─────────────────────────────────────────────────────────────

export interface LiquidationEvent {
  type: 'liquidation'
  timestamp: string // nanoseconds
  product_ids: number[]
  liquidator: string // bytes32
  liquidatee: string // bytes32
  amount: string // x18 — positive = long, negative = short
  price: string // x18 — oracle price
  // Derived fields (optional, computed client-side)
  amountUsd?: number
  priceUsd?: number
  side?: 'long' | 'short'
  pair?: string
}

// ─── Orderbook ───────────────────────────────────────────────────────────────

export interface OrderbookLevel {
  price: number
  size: number
  total?: number
}

export interface OrderbookState {
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  lastUpdateMs: number
}

// ─── Positions & Account ─────────────────────────────────────────────────────

export interface Position {
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

export interface AccountHealth {
  health_score: number
  total_collateral_usd: number
  maintenance_margin: number
  maint_margin_usage: number
  available_margin: number
  total_notional: number
  risk_level: RiskLevel
  drop_tolerance: number
}

// ─── OI Heatmap ──────────────────────────────────────────────────────────────

export interface OIBucket {
  price_low: number
  price_high: number
  long_oi_usd: number
  short_oi_usd: number
  risk_score: number
}

// ─── Survival Metrics ────────────────────────────────────────────────────────

export interface SurvivalMetrics {
  dropTolerance: number
  riskLevel: RiskLevel
  isMaintWeightCritical: boolean
  isCritical: boolean
}

// ─── Trade History ───────────────────────────────────────────────────────────

export interface TradeMatch {
  timestamp: string
  product_id: number
  pair: string
  amount: string // x18
  price: string // x18
  realized_pnl: string // x18
  closed_amount: string // x18
  fee: string
  side: 'long' | 'short'
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

export interface WalletStats {
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
