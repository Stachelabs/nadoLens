// ─── Utility ─────────────────────────────────────────────────────────────────

/** x18 string → number via BigInt. Avoids parseFloat precision loss on large amounts. */
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
  /** Subaccount bytes32 from Gateway (disambiguates cross + isolated same product). */
  subaccount: string
  /** Friendly name from Archive subaccounts endpoint (e.g. default, default_1). */
  subaccount_name?: string
  /** For isolated positions: parent cross subaccount name resolved via Gateway isolated_positions. */
  parent_subaccount_name?: string
  /** For isolated positions: parent cross subaccount bytes32 for matches replay scoping. */
  parent_subaccount?: string
  /** Raw x18 base size from Gateway — used to reconcile VWAP replay vs `subaccount_info`. */
  amount_x18: string
  amount: number
  entry_price: number | null
  /** Cumulative funding paid/received since position inception (x18 → USD). Positive = received. */
  funding_cumulative: number | null
  /** Cumulative fees paid for the current open session (reset when position goes flat). */
  fees_cumulative: number | null
  /** Gross realized PnL from partial closes in the current open session. */
  realized_pnl_cumulative: number | null
  mark_price: number
  unrealized_pnl: number
  liquidation_price: number
  margin_used: number
  maint_weight: number
  isolated: boolean
}

// ─── Trade History ────────────────────────────────────────────────────────────

export type TradeMatch = {
  digest?: string
  /** Subaccount bytes32 from Archive `matches.order.sender` when available. */
  subaccount?: string
  /** True when this fill is taker-side for the tracked sender. */
  is_taker?: boolean
  /** True when this fill opened/closed an isolated margin position (from Archive `matches.isolated`). */
  isolated?: boolean
  timestamp: string
  submission_idx: string
  product_id: number
  pair: string
  amount: string        // x18
  price: string         // x18
  quote_filled?: string // x18
  realized_pnl: string  // x18
  closed_amount: string // x18
  fee: string           // x18 — taker/maker + sequencer fees (total) — utiliser ce champ pour totalFees
  sequencer_fee: string // x18 — breakdown séquenceur uniquement (déjà inclus dans fee)
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

export type SubaccountHealthEntry = {
  subaccount: string
  subaccount_name: string   // normalized: "main", "1", "2"…
  health_score: number      // 0–1
  isolated: boolean
  pair?: string             // isolated only: position ticker e.g. "BTC-PERP"
}

export type WalletStats = {
  address: string

  // Positions (live, polled 6s)
  health_score: number
  subaccount_healths: SubaccountHealthEntry[]
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
  perp_volume_usd: number
  spot_volume_usd: number
  total_volume_usd: number
  avg_trade_size_usd: number
  perp_trades_count: number
  spot_trades_count: number
  first_trade_at: string | null
  last_trade_at: string | null
  trades_complete: boolean
}
