// ─── Utility ─────────────────────────────────────────────────────────────────

export const fromX18 = (val: string): number => parseFloat(val) / 1e18

/**
 * Conversion x18 string → number via BigInt.
 * Avoids parseFloat precision errors on large amounts.
 */
export const fromX18BigInt = (val: string): number => {
  if (!val || val === '0') return 0
  try {
    const n = BigInt(val)
    const PRECISION = BigInt(10) ** BigInt(18)
    const whole = n / PRECISION
    const frac = n % PRECISION
    return Number(whole) + Number(frac) / 1e18
  } catch {
    return parseFloat(val) / 1e18
  }
}

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
  amount: string        // x18
  price: string         // x18
  realized_pnl: string  // x18
  closed_amount: string // x18
  fee: string           // x18 — taker/maker fee
  sequencer_fee: string // x18 — sequencer fee
  side: 'long' | 'short'
  is_perp: boolean
}

// ─── Spot Balances ────────────────────────────────────────────────────────────

export type SpotBalance = {
  product_id: number
  symbol: string
  name: string
  amount: number
  value_usd: number
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export type WalletStats = {
  address: string

  // Positions (live, polled 30s)
  health_score: number
  total_equity_usd: number
  available_margin: number
  maintenance_margin: number
  unrealized_pnl_usd: number
  positions: Position[]
  spot_balances: SpotBalance[]

  // PnL — 3 categories
  trading_pnl_usd: number
  total_fees_usd: number
  funding_pnl_usd: number
  net_pnl_usd: number

  // Trade stats
  trades: TradeMatch[]
  win_rate: number
  total_volume_usd: number
  avg_trade_size_usd: number
  perp_trades_count: number
  spot_trades_count: number
  first_trade_at: string | null
  last_trade_at: string | null
  trades_complete: boolean
}
