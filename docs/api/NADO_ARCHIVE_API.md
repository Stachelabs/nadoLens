# NADO Archive Indexer API
> Source: https://docs.nado.xyz/developer-resources/api/archive-indexer
> Auto-generated — regenerate when API changes

## Endpoints

- **Mainnet:** `https://archive.prod.nado.xyz/v1`
- **Testnet:** `https://archive.test.nado.xyz/v1`

All requests: `POST [ARCHIVE_ENDPOINT]` with header `Accept-Encoding: gzip, br, deflate`

---

## Subaccounts

**Find all subaccounts for a wallet address**

```json
POST /
{
  "subaccounts": {
    "address": "0x79CC76364b5Fb263A25bD52930E3d9788fCfEEA8"
  }
}
```

Parameters:
| Parameter | Type | Description |
|---|---|---|
| address | string | Wallet address (optional, filters by address) |
| start | string/number | Start ID for pagination (default: 0) |
| limit | string/number | Max results (default: 100, max: 500) |

Response:
```json
{
  "subaccounts": [
    {
      "id": "25",
      "subaccount": "0x12a0b4888021576eb10a67616dd3dd3d9ce206b664656661756c740000000000",
      "address": "0x12a0b4888021576eb10a67616dd3dd3d9ce206b6",
      "subaccount_name": "default",
      "created_at": "1699949771",
      "isolated": false
    },
    {
      "id": "1094",
      "subaccount": "0x12a0b4888021576eb10a67616dd3dd3d9ce206b600000000000000020069736f",
      "address": "0x12a0b4888021576eb10a67616dd3dd3d9ce206b6",
      "subaccount_name": "0x00000000000000020069736f",
      "created_at": "1748982886",
      "isolated": true
    }
  ]
}
```

**Rate limit:** weight = 2 | 1200 req/min

---

## Isolated Subaccounts

**Find isolated subaccounts of a parent subaccount**

```json
POST /
{
  "isolated_subaccounts": {
    "subaccount": "0x79cc76364b5fb263a25bd52930e3d9788fcfeea864656661756c740000000000",
    "limit": 100
  }
}
```

Parameters:
| Parameter | Type | Description |
|---|---|---|
| subaccount | string | bytes32 of the parent subaccount |
| start_idx | number | Start index (default: 0) |
| limit | number | Max results (default: 100, max: 500) |

Response:
```json
{
  "isolated_subaccounts": [
    {
      "subaccount": "0x79cc76364b5fb263a25bd52930e3d9788fcfeea864656661756c740000000000",
      "isolated_subaccount": "0x79cc76364b5fb263a25bd52930e3d9788fcfeea800000000000000010069736f",
      "product_id": 1,
      "created_at": "1683315718"
    }
  ]
}
```

> ⚠️ Isolated subaccounts persist in the indexer even after the position is closed. They contain the full trade history.

**Rate limit:** weight = 2 | 1200 req/min

---

## Matches

**Main endpoint for trade history.**

```json
POST /
{
  "matches": {
    "subaccounts": [
      "0x12a0b4888021576eb10a67616dd3dd3d9ce206b664656661756c740000000000"
    ],
    "product_ids": [1, 2],
    "limit": 500,
    "idx": "563012",
    "isolated": null
  }
}
```

Parameters:
| Parameter | Type | Required | Description |
|---|---|---|---|
| subaccounts | string[] | No | Array of bytes32. Max 5 subaccounts. |
| product_ids | number[] | No | Product IDs. Omitted = all products. |
| idx | number/string | No | Pagination: returns matches with submission_idx <= idx |
| max_time | number/string | No | Filter by timestamp (unix epoch seconds) if idx not provided |
| limit | number | No | Max results (default: 100, **max: 500**) |
| isolated | boolean/null | No | `true` = isolated only, `false` = cross only, `null` = all |

Response (key fields):
```json
{
  "matches": [
    {
      "digest": "0x80ce...",
      "base_filled": "736000000000000000",
      "quote_filled": "-20276464287857571514302",
      "fee": "4055287857571514302",
      "builder_fee": "0",
      "sequencer_fee": "0",
      "cumulative_fee": "4055287857571514302",
      "closed_amount": "0",
      "realized_pnl": "0",
      "closed_net_entry": "0",
      "margin": null,
      "submission_idx": "563012",
      "isolated": false,
      "is_taker": true,
      "pre_balance": { ... },
      "post_balance": { ... }
    }
  ],
  "txs": [ ... ]
}
```

### Key fields for NadoLens

| Field | Description | Usage |
|---|---|---|
| `submission_idx` | Pagination cursor (desc) | Pass to next call as `idx` |
| `fee` | Taker/maker + sequencer fees (x18, total) | `totalFees += fee` |
| `sequencer_fee` | Sequencer breakdown only (x18) | Do NOT sum — already included in `fee` |
| `realized_pnl` | Realized PnL (x18) | **Count only if `closed_amount !== 0`** |
| `closed_amount` | Closed amount (x18) | If `!= 0` → position closed → accountable PnL |
| `closed_net_entry` | Realized entry price (x18) | Quote value at opening of the closed portion |
| `margin` | Allocated margin (x18, isolated only) | null for cross-margin |
| `quote_filled` | USDT0 value (negative = buy) | `volume += Math.abs(quote_filled)` |
| `is_taker` | true = taker, false = maker | Taker ratio |
| `isolated` | Isolated or cross position | Filtering |

### Precise calculation rules

```typescript
// x18 → readable number conversion
// ⚠️ DO NOT use Number(BigInt(val)) / 1e18 — loses precision for amounts > 2^53
// ✅ Use fromX18BigInt from @/types/nado (BigInt integer division)
import { fromX18BigInt } from '@/types/nado'

// Volume = absolute value of quote
volume += Math.abs(fromX18BigInt(match.quote_filled))

// Fees = fee only (fee already includes taker/maker + sequencer — sequencer_fee is a breakdown, do NOT sum)
fees += fromX18BigInt(match.fee)

// Realized PnL = ONLY if position was closed
if (fromX18BigInt(match.closed_amount) !== 0) {
  realizedPnl += fromX18BigInt(match.realized_pnl)
}
```

### Pagination logic

```typescript
// First call: no idx
// Subsequent calls: idx = submission_idx of the LAST item on the previous page
// Stop condition: page.length < 500

let idx: string | undefined
while (true) {
  const page = await fetchMatches({ subaccounts, limit: 500, ...(idx && { idx }) })
  allMatches.push(...page)
  if (page.length < 500) break
  idx = page[page.length - 1].submission_idx
}
```

**Rate limit:** `weight = 2 + (limit * subaccounts.length / 10)` | Max IP weight: 2400/min

> ⚠️ With limit=500 and 1 subaccount → weight=52. Max ~46 calls/min. Space calls ~1.3s apart.

---

## Orders

**Order history (aggregated, multi-fills).**

```json
POST /
{
  "orders": {
    "subaccounts": ["0x12a0b4888...64656661756c740000000000"],
    "product_ids": [1, 2],
    "limit": 500,
    "isolated": null
  }
}
```

Parameters: same as Matches + optional `trigger_types` (`price_trigger`, `time_trigger`, `none`).

Additional fields vs Matches:
| Field | Description |
|---|---|
| `last_fill_submission_idx` | idx of the last fill (multi-fills) |
| `first_fill_timestamp` | First fill timestamp (unix seconds) |
| `last_fill_timestamp` | Last fill timestamp (unix seconds) |
| `closed_margin` | Weighted average margin on closed portion (isolated only) |
| `prev_position` | Position before first fill (x18, added March 2026) |

**Rate limit:** `weight = 2 + (limit * subaccounts.length / 20)` | 1200 req/min

---

## Events

**On-chain events (deposits, withdrawals, settlements, trades...).**

Available types: `liquidate_subaccount`, `deposit_collateral`, `withdraw_collateral`, `settle_pnl`, `match_orders`, `mint_lp`, `burn_lp`

```json
POST /
{
  "events": {
    "subaccounts": ["0x12a0b4888..."],
    "event_types": ["settle_pnl", "deposit_collateral"],
    "limit": { "raw": 100 }
  }
}
```

Limit parameter: `{ "raw": N }` (events) or `{ "txs": N }` (transactions).

**Rate limit:** `weight = 2 + (limit * subaccounts.length / 10)`

---

## Interest & Funding Payments

**Funding and interest payment history.**

```json
POST /
{
  "interest_and_funding": {
    "subaccount": "0xD028878bF5c96218E53DA859e587cb8398B17b3f64656661756c740000000000",
    "product_ids": [1, 2],
    "limit": 100,
    "max_idx": 1315836
  }
}
```

> ⚠️ `subaccount` (singular), not `subaccounts`. `product_ids` required.

Response:
```json
{
  "interest_payments": [
    { "product_id": 4, "idx": "5968022", "timestamp": "1701698400", "amount": "-12273223338657163", ... }
  ],
  "funding_payments": [
    { "product_id": 2, "idx": "5968022", "timestamp": "1701698400", "amount": "-12273223338657163", ... }
  ],
  "next_idx": "1314805"
}
```

Pagination: use `next_idx` as `max_idx` in the next call. `null` = last page.

> 💡 For total net PnL: `realizedPnl - totalFees + sum(funding_payments.amount)`

**Rate limit:** weight = 5 | 480 req/min

---

## Funding Rate

```json
// Single product
POST / { "funding_rate": { "product_id": 2 } }

// Multiple products
POST / { "funding_rates": { "product_ids": [2, 3] } }
```

Response: `funding_rate_x18` (24h rate × 1e18), `update_time` (unix seconds).

**Rate limit:** weight = 2 | 1200 req/min

---

## Perp Prices

```json
// Single
POST / { "price": { "product_id": 2 } }

// Multiple
POST / { "perp_prices": { "product_ids": [2, 3] } }
```

Response: `index_price_x18`, `mark_price_x18`, `update_time`.

**Rate limit:** weight = 2 | 1200 req/min

---

## Liquidation Feed

```json
POST / { "liquidation_feed": {} }
```

Returns currently liquidatable subaccounts with their `update_time`.

**Rate limit:** weight = 2 | 1200 req/min

---

## Direct Deposit Address

```json
POST /
{
  "direct_deposit_address": {
    "subaccount": "0x79cc76364b5fb263a25bd52930e3d9788fcfeea864656661756c740000000000"
  }
}
```

**Rate limit:** weight = 10 | 240 req/min

---

## Ink Airdrop

```json
POST /
{
  "ink_airdrop": {
    "address": "0x1234567890123456789012345678901234567890"
  }
}
```

Returns `amount` (Ink token allocation, x18).

**Rate limit:** weight = 2 | 1200 req/min

---

## Account Snapshots

**Current account state — used to compute average entry price (`net_entry_unrealized`).**

```json
POST /
{
  "account_snapshots": {
    "subaccounts": [
      "0x79cc76364b5fb263a25bd52930e3d9788fcfeea864656661756c740000000000"
    ],
    "timestamps": [1712345678],
    "active": true
  }
}
```

Parameters:
| Parameter | Type | Required | Description |
|---|---|---|---|
| subaccounts | string[] | Yes | bytes32 of parent (cross) subaccounts |
| timestamps | number[] | Yes | Unix seconds — Archive extrapolates tracked variables at that point. Use `Math.floor(Date.now() / 1000)`. |
| active | boolean | No | If `true`, returns only positions with non-zero balance |
| isolated | boolean | No | Filter by position type |

> ⚠️ Always query the **parent** (cross) subaccount. The pocket subaccount returns `{}`.
> A single call covers both cross (`isolated: false`) AND isolated (`isolated: true`) positions.

Response:
```json
{
  "snapshots": {
    "0x79cc...000000": {
      "1712345678": [
        {
          "product_id": 2,
          "isolated": false,
          "post_balance": {
            "perp": {
              "product_id": 2,
              "balance": { "amount": "-100000000000000000" }
            }
          },
          "net_entry_unrealized": "-6857100000000000000000"
        }
      ]
    }
  }
}
```

### Average entry price computation

```typescript
import { fromX18BigInt } from '@/types/nado'

// `entry` = one item from the snapshots[subaccount][timestamp][] array
// There is no "events" key in the response — these are items in an array
// avg_entry = |net_entry_unrealized / amount|
// Both fields are in x18 → the 1e18 factors cancel out
const amount = fromX18BigInt(entry.post_balance?.perp?.balance?.amount ?? '0')
const netEntry = fromX18BigInt(entry.net_entry_unrealized)
const avgEntry = Math.abs(amount) > 1e-12 ? Math.abs(netEntry / amount) : null
```

**Lookup key:** `${subaccount.toLowerCase()}:${product_id}:${isolated}`

| Field | Description |
|---|---|
| `net_entry_unrealized` | Current position cost (x18). Proportionally reset on close. |
| `post_balance.perp.balance.amount` | Current size (x18, positive=long, negative=short) |
| `isolated` | `true` for isolated positions, `false` for cross |

**Rate limit:** weight = 2 | 1200 req/min

---

## Important notes (NadoLens)

### Full NadoLens flow for a wallet address

```
1. [Archive]  POST /subaccounts { address }
              → all bytes32: cross + isolated pockets (isolated: true)
              → source of truth for whether a subaccount is isolated or cross

2. [Gateway]  GET /query?type=isolated_positions&subaccount={crossSub}
              → for each cross sub: pocket→parent name mapping
              ⚠️ DO NOT use /isolated_subaccounts (Archive) — NadoLens uses
              isolated_positions (Gateway) which exposes the live parent↔pocket mapping.

3. [Gateway]  GET /query?type=subaccount_info (per subaccount, parallel)
              → open positions, spot balances, health score

4. [Archive]  POST /account_snapshots { subaccounts: [cross subs], timestamps: [now] }
              → avg entry price (net_entry_unrealized / amount) per position

5. [Archive]  POST /matches { subaccounts: [all bytes32], limit: 500, isolated: null }
              → paginated trade history (MAX 5 subaccounts per call → chunk if >5)

6. [Archive]  POST /interest_and_funding { subaccount: crossSub, product_ids: [...] }
              → historical funding PnL (paginated via next_idx)
```

### bytes32 format

```
bytes32 = wallet address (20 bytes) + subaccount name (12 bytes)
Example "default" → 64656661756c740000000000
Result: 0x{walletAddress}{subaccountNameHex}
```

---

## Nado Points (undocumented, public)

**Get all-time points, rank, tier + per-epoch distribution history**

**CRITICAL — separate base path**: as of 2026-09, Nado moved `nado_points` and
`ink_airdrop` off `archive.prod.nado.xyz/v1` onto `archive.prod.nado.xyz/rewards/v1`.
Calling them on `/v1` now 403s with `unknown variant`. `account_snapshots` and
every other Archive call stay on `/v1` — only these two rewards endpoints moved.
Use `NADO_ARCHIVE_REWARDS_REST` (`lib/nado.ts`), not `NADO_ARCHIVE_REST`.

```json
POST https://archive.prod.nado.xyz/rewards/v1
{
  "nado_points": {
    "address": "0xc5a752A4B8d751859d29af9069486B5b48Fa9499"
  }
}
```

Response:
```json
{
  "points_per_epoch": [
    {
      "epoch": 4,
      "description": "Week 1",
      "start_time": "1769821200",
      "end_time": "1770339600",
      "total_points": "1097026000013000000000000",
      "points": "355168255000000000000",
      "rank": 314,
      "tier": 5
    }
  ],
  "all_time_points": {
    "points": "7765089484913353750000",
    "rank": 387,
    "tier": 5
  }
}
```

Notes:
- All points values are **x18 strings** — use `fromX18BigInt()`
- Tier mapping: 1=Breeze, 2=Gust, 3=Wind, 4=Storm, 5=Tornado
- Each epoch `tier` is the **weekly** tier; `all_time_points.tier` is the **all-time** tier
- Epochs with `points: "0"` = no activity that week
- Confirmed public by Nado team (Przemek) — not listed in official docs

---

## INK Airdrop (documented, future)

**Get $INK token airdrop allocation (not yet active)**

Also moved to `archive.prod.nado.xyz/rewards/v1` — see note above.

```json
POST https://archive.prod.nado.xyz/rewards/v1
{
  "ink_airdrop": {
    "address": "0xc5a752A4B8d751859d29af9069486B5b48Fa9499"
  }
}
```

Response: `{"amount": "0"}` — returns "0" until $INK token airdrop goes live.

Weight: 2. Rate limit: 1200 req/min.

---

## Rewards API — full endpoint map (undocumented, discovered 2026-09)

`archive.prod.nado.xyz/rewards/v1` accepts **13 request variants**, not just
`nado_points`/`ink_airdrop`. Discovered by sending an invalid variant name and
reading the deserialize error, which lists every accepted type:

```
leaderboard · leaderboard_rank · leaderboard_contests · leaderboard_registrations
leaderboard_register · social_connect · list_social_accounts · revoke_social_account
ink_airdrop · private_alpha_choice · nado_points · nado_xpoints · cash_incentives
```

None of these (besides `nado_points`/`ink_airdrop`) are referenced in NadoLens
code today. Documenting what each does in case they're useful later — all
confirmed live via direct curl, all public/unauthenticated like `nado_points`.

### `cash_incentives` — live weekly USD reward pool (separate from points)

Real cash, not points. Weekly volume-tiered payout with merkle-proof claims
against a dedicated airdrop contract, independent of the $INK/points system.

```json
POST https://archive.prod.nado.xyz/rewards/v1
{ "cash_incentives": { "wallet_address": "0x..." } }
```

Response shape:
```json
{
  "events": [
    {
      "metadata": {
        "event_id": 6, "description": "Week 6",
        "epoch_start": "1788787800", "epoch_end": "1789392600",
        "min_volume": "1050000000000000000000000000",
        "max_volume": "2450000000000000000000000000",
        "min_reward": "50000000000000000000000",
        "max_reward": "100000000000000000000000"
      },
      "platform": { "platform_volume": "...", "unlocked_reward": "..." },
      "wallet": {
        "reward": "30587383903267827803",
        "claim": {
          "status": "claimable",
          "airdrop_address": "0xbeb0994d29e4b34f9103d0d6faa32b488ef8864d",
          "week": 4, "total_amount": "30587383",
          "proof": ["0x...", "..."]
        }
      }
    }
  ],
  "wallet_summary": { "total_reward": "...", "claimable_reward": "..." }
}
```

Notes:
- `min_volume`/`max_volume`/`min_reward`/`max_reward` are x18 — platform-wide
  volume for that week determines the payout tier for everyone.
- `claim.status` seen so far: `"pending"`, `"in_progress"`, `"claimable"`.
- `wallet.reward` and `wallet_summary.total_reward`/`claimable_reward` are x18.
- 6 weekly events observed as of 2026-09; program appears ongoing.
- Param name is `wallet_address`, not `address` (inconsistent with every other
  variant here).

### `nado_xpoints` — second, separate points currency ("quest" based)

Distinct from `nado_points`. Structured around named quest types rather than
raw trading activity.

```json
POST https://archive.prod.nado.xyz/rewards/v1
{ "nado_xpoints": { "address": "0x..." } }
```

Response shape:
```json
{
  "points_per_epoch": [
    {
      "epoch": 1, "description": "Week 1",
      "start_time": "1783040400", "end_time": "1783645200",
      "total_points": "0",
      "quests": [
        { "quest_type": "ProtocolDepositBoost", "points": "0" },
        { "quest_type": "ProtocolTieredVolumeBoost", "points": "0" }
      ],
      "rank": 0
    }
  ],
  "all_time_points": {
    "total_points": "0",
    "quests": [ { "quest_type": "...", "points": "0" } ],
    "rank": 0
  }
}
```

Notes:
- Only 2 quest types observed so far (`ProtocolDepositBoost`,
  `ProtocolTieredVolumeBoost`); all-zero across 9 epochs for every wallet
  checked — schema exists, payouts don't appear to be live yet.
- Likely infrastructure for a future points-multiplier/boost mechanic.

### `leaderboard*` — recurring cash trading competitions

Four related variants:

- `leaderboard_contests` — list all contests, no params (`{"leaderboard_contests":{}}`).
  Each contest has `tracks` (e.g. `roi`, `volume`), a title/description, and
  `active` flag. 2 contests observed so far, both ended.
- `leaderboard` — `{"leaderboard":{"contest_id": N, "rank_type": "roi"|"volume"}}`
  → full ranked positions list for that contest/track.
- `leaderboard_rank` — `{"leaderboard_rank":{"contest_ids": [N,...], "subaccount": "0x..."}}`
  → one wallet's position across multiple contests at once.
- `leaderboard_registrations` — `{"leaderboard_registrations":{"subaccount": "0x..."}}`
  → which contests a subaccount has registered for.
- `leaderboard_register` — presumably the write/opt-in call (not tested — looks
  mutating, avoid probing without a real signed-in context).

Leaderboard position objects carry a `social_accounts: []` field — ties into
the social-linking endpoints below, likely for eligibility or bonus multipliers.

Example contest from `leaderboard_contests`:
```json
{
  "contest_id": 1,
  "title": "Cash Trading Competition - Week 1",
  "description": "ROI and Volume tracks across all markets",
  "start_time": "1779717600", "end_time": "1780322400",
  "active": false,
  "tracks": [
    { "track_id": 1, "rank_type": "roi", "threshold": "1000" },
    { "track_id": 2, "rank_type": "volume", "threshold": "10000" }
  ]
}
```

### `social_connect` / `list_social_accounts` / `revoke_social_account`

Account-linking endpoints (X/Discord/etc — exact provider not confirmed, not
probed since `social_connect`/`revoke_social_account` look mutating). Referenced
by the empty `social_accounts` array on leaderboard positions — schema exists,
not observed populated on any wallet checked yet.

### `private_alpha_choice` — NFT eligibility + fee refund track

```json
POST https://archive.prod.nado.xyz/rewards/v1
{ "private_alpha_choice": { "address": "0x..." } }
```

Response: `{"points": "0", "fee_refund": "0", "nft_eligibility": false}`

Separate track for early/private-alpha participants — points, a fee refund
amount, and an NFT eligibility flag, independent of `nado_points`.

### Caution

`leaderboard_register`, `social_connect`, and `revoke_social_account` were
**not** probed — their names suggest write/mutating operations, unlike every
other variant here which is read-only. Don't call them without understanding
what they do first.

---

### Number precision

All amounts are x18 (multiplied by 1e18).
```typescript
// ✅ Use fromX18BigInt (BigInt integer division — no precision loss)
import { fromX18BigInt } from '@/types/nado'
// ❌ WRONG: Number(BigInt(val)) / 1e18 — loses precision beyond 2^53 (~9e15)
```
