# NADO — Core Concepts
> Source: docs.nado.xyz
> Auto-generated — regenerate when docs change

---

## Subaccounts

A subaccount = a trading compartment linked to a wallet. bytes32 format = `address (20 bytes) + name (12 bytes)`.

### Naming

| Name | Hex suffix | Description |
|---|---|---|
| `default` | `64656661756c740000000000` | Primary subaccount |
| `default_1` | `64656661756c745f31000000` | Additional subaccount #1 |
| `default_2` | `64656661756c745f32000000` | Additional subaccount #2 |
| `default_3` | `64656661756c745f33000000` | Additional subaccount #3 |

- Front-end: max 4 subaccounts per wallet
- API: no limit
- Creation: requires an initial deposit (min $5 USDT0)

### Isolated Subaccounts

Each isolated margin position creates a **dedicated isolated subaccount**. These subaccounts persist in the archive indexer after the position is closed — history is accessible indefinitely.

To retrieve **all** subaccounts for an address:
```
1. GET /subaccounts?address=0x... → default + default_1, etc.
2. GET /isolated_subaccounts?subaccount={default_bytes32} → associated isolated ones
3. Use ALL these bytes32 in /matches calls
```

---

## Margin Types

### Unified Margin (Cross-Margin) — default

All deposits, positions and PnL form **a single collateral pool**. The risk engine computes a single health score that automatically nets opposing risks.

- Advantage: maximum capital efficiency — profits on one position offset losses on another
- Spread trades recognized as hedges → reduced margin requirements
- The leverage selected in the UI is only an order size control, not reserved margin

### Isolated Margin

Fixed collateral allocated to **a single perp position**, isolated from the rest of the account.

- One isolated subaccount per perpetual market
- Position liquidation does not affect the main account
- Funds move from cross pool → isolated subaccount when position is opened
- Persists in the indexer after closing (see above)

---

## Health

Health quantifies the resilience of a subaccount.

```
healths[0] = Initial Health  → ability to open new positions (< 0 = blocked)
healths[1] = Maintenance Health → buffer before liquidation (< 0 = immediate liquidation)
healths[2] = Unweighted Health
```

### Formulas

**Spot:**
```
Spot Health = weight × amount × price
```

**Perpetual:**
```
Perp Health = amount × (weight × current_price - entry_price)
```

### Weights per asset type

Each product has 4 weights:
- `long_weight_initial_x18` (initial health, long)
- `long_weight_maintenance_x18` (maintenance health, long)
- `short_weight_initial_x18` (initial health, short)
- `short_weight_maintenance_x18` (maintenance health, short)

### Implied maximum leverage

```
max_leverage = 1 / (1 - initial_asset_weight)
```
Example: weight = 0.95 → 20x max leverage

### Spread Health (hedged positions)

When you have long spot BTC + short BTC-PERP, the system recognizes the hedge:

```
spread_weight = 1 - (1 - product_weight) / 5
// Caps: initial ≤ 0.99, maintenance ≤ 0.994

spread_health_increase = basis_amount × (spot_price + perp_price) × (spread_weight - existing_weight)
```

Result: ~5x more margin available on the hedged portion.

---

## PnL Settlements

Settlements continuously convert unrealized PnL into real USDT0, without closing positions.

```
Total PnL = Unsettled USDT0 + Settled USDT0
Account Value = Assets - Borrows + Unsettled USDT0
```

- **Unsettled USDT0**: PnL pending transfer (fluctuates with the market)
- **Settled USDT0**: PnL already integrated into the USDT0 balance

When a position closes, all unsettled settles automatically.

If PnL is negative without sufficient USDT0 → Nado auto-borrows at market rates.

---

## Fees

### Maker/Taker Structure

- **Maker** (limit orders that add liquidity): rebates at higher tiers
- **Taker** (market orders that remove liquidity): modest fees

Calculated in bps (0.01%) of notional value, settled in USDT0.

### Tiers (based on 30-day volume)

| Tier | 30d Volume | Taker | Maker |
|---|---|---|---|
| Entry | $0 | 3.5 bps | 1 bp |
| Mid | $25M+ | 3 bps | 0.5 bp |
| Elite | $5B+ | 1.5 bps | -0.8 bps (rebate) |

### Sequencer fees

| Action | Fee |
|---|---|
| Deposit | 0 USDT0 |
| Place order (maker/taker) | 0 USDT0 |
| Transfer between subaccounts | 1 USDT0 (0.1 if isolated) |
| USDT0 withdrawal | 1 USDT0 |
| wETH withdrawal | 0.0006 wETH |
| Fast withdrawal | 1 USDT0 + max(5 USDT0, 10bps × amount) |

### Fees in the API

In matches/orders responses:
```typescript
// fee = taker/maker fees + sequencer fees combined (total to use)
// sequencer_fee = sequencer breakdown only — ALREADY INCLUDED in fee, do NOT sum
// builder_fee = builder fees (if applicable) — ALREADY INCLUDED in fee

totalFees = fee  // ✅ correct: fee = total. sequencer_fee is a breakdown, do not add it.
// ❌ WRONG: totalFees = fee + sequencer_fee  (double-count)
```

---

## Numeric precision (x18)

All amounts in the API are multiplied by **1e18**.

```typescript
// ⚠️ DO NOT use parseFloat() — loses decimals beyond the 16th significant digit
// ⚠️ DO NOT use Number(BigInt(val)) / 1e18 — same loss for large amounts (> 2^53)
// ✅ Use fromX18BigInt from @/types/nado (BigInt integer division → no precision loss)
import { fromX18BigInt } from '@/types/nado'

// Example: "736000000000000000" → 0.736 (ETH)
// Example: "27544000000000000000000" → 27544 (BTC price in USD)
```

### Exceptions

- `DepositCollateral` / `WithdrawCollateral`: physical token amount (6 decimals for USDT0, 18 for wETH)
- `min_size`: in notional USDT0, not base quantity

---

## Funding Rates

Rates calculated every hour. Positive → longs pay shorts. Negative → shorts pay longs.

The annualized rate is reduced to an hourly payment.

To include funding in real net PnL:
```typescript
netPnL = realizedPnl - totalFees + sum(funding_payments.amount)
```

---

## Products (product_ids)

| product_id | Asset | Type |
|---|---|---|
| 0 | USDT0 | Spot (quote currency) |
| 1 | wBTC | Spot |
| 2 | BTC-PERP | Perp |
| ... | ... | ... |

Retrieve the full up-to-date list via `GET /query?type=all_products`.
IDs are stable — a product_id never changes.

---

## Liquidations

Triggered when `maintenance health < 0`.

Liquidation order:
1. Cancel all open orders of the subaccount
2. Liquidate assets (spot longs, spread longs)
3. Repay liabilities (borrows, shorts)

Liquidation fee: 1 USDT0 (to the liquidator).
