# ARCHI.md — NadoLens Wallet Explorer Architecture
> Technical architecture for the Wallet Explorer feature — `/wallet/[address]`

---

## 1. Data Flow

```
Browser → /wallet/0xabc...
  │
  │ useWalletData(address) — client hook
  │
  ├── 0. pairsStore.init() — via PairsInitializer (on app startup)
  │         fetch /api/pairs → GET gateway.prod.nado.xyz/v2/assets
  │         → Map<product_id, symbol> + perp[] + spot[] (persisted in localStorage, TTL 1h)
  │
  ├── 1. fetch /api/subaccounts/{address}
  │         Next.js API Route → POST archive.prod.nado.xyz/v1
  │         body: { subaccounts: { address } }
  │         → [{ subaccount: bytes32, isolated: bool }]
  │         Fallback on failure: "default" subaccount computed locally
  │
  ├── 2. Promise.all → for each subaccount:
  │         fetch /api/wallet/{subaccount}?query=subaccount_info
  │         Next.js API Route → POST gateway.prod.nado.xyz/v1/query
  │         → health, balances, positions, oracle prices
  │         Merge: all positions + sum equity + health of primary subaccount
  │
  └── 3. fetch archive.prod.nado.xyz/v1
            POST { matches: { subaccounts: [all_bytes32], limit: 500, isolated: null } }
            → trade history with realized_pnl, fees, sequencer_fee

Results → WalletStats parsed in useWalletData
         → wallet components (WalletHeader, WalletStats, WalletPositions, etc.)

Refresh strategy:
  - Positions: 30s polling via setInterval (all subaccounts via subaccountsRef)
  - Trade history: initial fetch only
  - Assets (pairsStore): TTL 1h, localStorage as fallback between sessions
```

---

## 2. Subaccount Resolution

An Ethereum wallet (20 bytes) is converted to a subaccount bytes32:

```typescript
function toSubaccount(address: string): string {
  const addr = address.toLowerCase().replace('0x', '')
  if (addr.length === 64) return `0x${addr}` // already bytes32
  return `0x${addr}64656661756c740000000000`  // "default" encoded
}
// Example: 0xc5a7... → 0xc5a7...64656661756c740000000000
```

The actual resolution via `/api/subaccounts/[address]` discovers **all** subaccounts (default + isolated margin). Without this call, isolated positions would not be visible.

### Isolated margin — parent vs pocket bytes32

Nado uses **two identifiers** for an open isolated position under a named subaccount (e.g. `default_1`):

| Role | Bytes32 | Gateway / Archive |
|------|---------|-------------------|
| **Parent** | The one returned by Archive `subaccounts` for the user name (`isolated: false` on listing side) | `subaccount_info` may have **size 0** on the isolated perp; **`matches`**: `order.sender` = parent, fill history |
| **Pocket** (auto) | Second bytes32 referenced in `isolated_positions(parent)[].subaccount` | `subaccount_info` **pocket** = real product balances; **`matches` on pocket alone** → `[]` |

Consequence for the Wallet Explorer: **trade aggregates / avg entry** → `matches` requests on **parent** bytes32(es) (chunk ≤ 5). **Position state** for an isolated → `isolated_positions(parent)` to resolve pocket + `product_id`, or `subaccount_info(pocket)`. See `CLAUDE.md` § isolated margin.

---

## 3. API Routes

### `/api/subaccounts/[address]/route.ts`
Subaccount resolution via Archive. Requires a valid EVM address (20 bytes).

```
GET /api/subaccounts/{address}
  → POST https://archive.prod.nado.xyz/v1
     body: { subaccounts: { address } }
  → { subaccounts: [{ subaccount: bytes32, isolated: bool }] }

Validation: isAddress(address) from viem → cast Address
Fallback returned on failure: [{ subaccount: toSubaccount(address), isolated: false }]
```

### `/api/wallet/[address]/route.ts`
Positions/health proxy. Accepts EVM address (20 bytes) **or** bytes32 (64 hex chars).

```
GET /api/wallet/{subaccount}?query=subaccount_info
  → POST https://gateway.prod.nado.xyz/v1/query
     body: { type: query, subaccount: address }

Validation: isAddress(address) || /^0x[a-fA-F0-9]{64}$/.test(address)
```

### `/api/pairs/route.ts`
List of all Nado assets with market_type. Used by pairsStore on startup.

```
GET /api/pairs
  → GET https://gateway.prod.nado.xyz/v2/assets
  → V2Asset[] validated by V2AssetsResponseSchema

Zod validation: V2AssetsResponseSchema
ISR cache: revalidate: 3600 (1h)
Static fallback: 5 spots (USDT0, KBTC, WETH, USDC, NLP) + 3 perps (BTC, ETH, SOL)
```

### `/api/matches/route.ts`
Archive proxy for `matches` with Zod validation of body and response.

```
POST /api/matches
  body: { subaccounts: string[], limit?: number, idx?: string, isolated?: boolean|null }
  → POST https://archive.prod.nado.xyz/v1
     body: { matches: { subaccounts, limit, idx?, isolated } }
  → { matches: [...], txs: [...] }
```

### `/api/funding/route.ts`
Archive proxy for `interest_and_funding` with Zod validation of body and response.

```
POST /api/funding
  body: { subaccount: string, product_ids: number[], limit?: number, max_idx?: string }
  → POST https://archive.prod.nado.xyz/v1
     body: { interest_and_funding: { subaccount, product_ids, limit, max_idx? } }
  → { funding_payments: [...], interest_payments: [...], next_idx }
```

---

## 4. pairsStore — Dynamic assets

`store/pairsStore.ts` — Zustand store with `persist` middleware (localStorage `nado-assets`).

```typescript
type PairsState = {
  assets: V2Asset[]           // persisted — ~60 assets (perp + spot)
  byId: Map<number, string>   // not persisted — product_id → symbol
  perp: V2Asset[]             // not persisted — market_type === 'perp'
  spot: V2Asset[]             // not persisted — market_type === 'spot' | null
  lastFetched: number | null  // persisted — timestamp ms (TTL 1h)
  initialized: boolean
  init: () => Promise<void>
}
```

**Behaviors:**
| Scenario | Result |
|---|---|
| First load, empty localStorage | fetch /api/pairs, store in localStorage |
| Reload, fresh localStorage (<1h) | rebuild Map from localStorage, skip fetch |
| Reload, stale localStorage (>1h) | rebuild from localStorage, then re-fetch |
| Network error | localStorage as real fallback |

`productName(id)` in `useWalletData.ts` accesses via `usePairsStore.getState().byId` (outside React, synchronous).

---

## 5. React components — current state

```
app/wallet/page.tsx                  ← Search page (Client) — isAddress + router.push
app/wallet/[address]/page.tsx        ← Wallet page (Client) — use(params) + useWalletData

components/wallet/
  WalletHeader.tsx     Props: { stats: WalletStats }      ← address, health, equity, margin
  WalletStats.tsx      Props: { stats: WalletStats }      ← win rate, PnL, volume, avg size
  WalletPositions.tsx  Props: { positions: Position[] }   ← open positions + unrealized PnL
  WalletTradeHistory.tsx Props: { trades: TradeMatch[] }  ← last 50 trades history
  WalletEquityCurve.tsx  Props: { trades: TradeMatch[] }  ← TradingView equity curve

hooks/
  useWalletData.ts     ← multi-subaccount fetch + 30s polling → WalletData
  usePairs.ts          ← triggers pairsStore.init() on mount (via PairsInitializer)
  useAccount.ts        ← wagmi useAccount wrapper (connected wallet)

store/
  pairsStore.ts        ← Zustand + persist — V2 assets, byId Map, perp[], spot[]
  accountStore.ts      ← Zustand — connected wallet state

lib/schemas/nado.ts    ← NadoSubaccountDataSchema + ArchiveMatchesResponseSchema + V2AssetSchema (Zod)
types/nado.ts          ← WalletStats, Position, TradeMatch, fromX18BigInt
app/providers.tsx      ← PairsInitializer (headless) → usePairs() on app startup
```

---

## 6. API → UI mapping

### WalletPositions
| Column | Source |
|---|---|
| Pair | `perp_balances[i].product_id` → `productName()` via pairsStore |
| Side | `perp_balances[i].balance.amount`: positive=LONG, negative=SHORT |
| Size | `abs(fromX18BigInt(amount))` |
| Entry Price | `oracle_price_x18` (mark price at fetch time — no stored entry) |
| Mark Price | `fromX18BigInt(oracle_price_x18)` |
| Unrealized PnL | `fromX18BigInt(v_quote_balance) + amount × markPrice` |
| Liq Price | estimated: `markPrice × (1 ± 1/leverage + maintMarginRate)` |

### WalletTradeHistory (archive matches)
| Column | Source |
|---|---|
| Time | `submission_idx` → estimate `Date.now() - diff × 2s` (Ink L2 ≈ 2s/block) |
| Price | `fromX18BigInt(order.priceX18)` |
| Qty | `abs(fromX18BigInt(base_filled))` |
| Realized PnL | `fromX18BigInt(realized_pnl)` |
| Fees | `fromX18BigInt(fee)` |

### WalletStats (computed in useWalletData)
```typescript
// Only position closings have a realized PnL (closed_amount !== "0")
const closingTrades = trades.filter(t => t.closed_amount !== "0")

winRate = closingTrades.length > 0
  ? (closingTrades.filter(t => BigInt(t.realized_pnl) > 0n).length / closingTrades.length) * 100
  : 0

totalPnl = sum(fromX18BigInt(t.realized_pnl) for t in closingTrades)
totalFees = sum(fromX18BigInt(t.fee))   // fee = taker/maker + sequencer (total) — sequencer_fee = breakdown, do NOT sum
totalVolume = sum(abs(fromX18BigInt(t.quote_filled ?? "0")))
avgTradeSize = totalVolume / trades.length
```

---

## 7. Matches pagination

The archive returns max 500 matches per request. Current implementation: limit=200, no pagination (MVP). To paginate:

```typescript
async function fetchAllMatches(subaccount: string, maxTotal = 2000) {
  const all = []
  let lastIdx: string | undefined
  while (all.length < maxTotal) {
    const body = { matches: { subaccounts: [subaccount], limit: 500, isolated: null, ...(lastIdx ? { idx: lastIdx } : {}) } }
    const res = await fetch(ARCHIVE_URL, { method: 'POST', ... })
    const data = await res.json()
    if (!data.matches?.length) break
    all.push(...data.matches)
    lastIdx = data.matches.at(-1).submission_idx
    if (data.matches.length < 500) break
  }
  return all
}
```

---

## 8. Refresh Strategy

| Data | Method | Interval |
|---|---|---|
| Positions / Health | Polling `/api/wallet/[subaccount]` | 30s |
| Trade history | Initial fetch only | — |
| Equity curve | Recomputed when `trades` changes | On mount |
| Assets (pairsStore) | Fetch + localStorage persist | TTL 1h |

> Real-time positions would require the `position_change` stream (requires private key of the wallet) — impossible for a third-party wallet. 30s polling is the only option to observe any wallet.

Why 30s?
- A compromise between load and precision: "near-live" view without API spam.
- `subaccount_info` costs weight, so 30s stays comfortable even with multiple subaccounts.
- Cannot subscribe to auth WS on a third-party wallet from the browser without their signature.

---

## 9. Rate Limits — Wallet Explorer

| Call | Weight | Frequency |
|---|---|---|
| `subaccounts` (Archive) | 2 | 1× on load |
| `subaccount_info` (Gateway) | 2 × nb_subaccounts | 30s |
| `matches` (Archive, limit=200, 1 sub) | 2 + 200/10 = 22 | 1× on load |
| Assets `/v2/assets` | — | 1× per hour max (localStorage TTL) |

Total per position refresh (2 subaccounts): ~4 weight → safe with 2400/min max.

---

## 10. Nado Points

Not available via public API. Ignore for MVP → display "—" or hide.

---

## 11. Known Bugs

| File | Bug | Fix |
|---|---|---|
| `hooks/useNadoPairs.ts` | Expects `{ pair }` but API returns `{ ticker_id, base, quote }` | Update schema |
| `app/api/orderbook/route.ts` | Param `?pair=BTCUSDT0` but API expects `?ticker_id=BTC-PERP_USDT0&depth=N` | Fix param |
| `app/api/predicted-liquidations/route.ts` | Parses `data.account_snapshots` but response = `data.snapshots` | Fix key |

---

*ARCHI.md v3.2 — NadoLens Wallet Explorer — updated 2026-04-03*

---

## README Architecture Block (copyable)

```md
## Wallet Volume Pipeline (NadoLens)

1) User opens `/wallet/[address]` → `useWalletData(address)` starts.
2) `GET /api/subaccounts/{address}` resolves all subaccounts (cross + isolated).
3) Subaccounts are chunked by 5 (`matches` API limit: max 5 subaccounts/request).
4) For each chunk, Nado Archive `matches` is fetched with pagination (`limit=500`, `idx` cursor).
5) Raw matches are normalized by `parseMatchesBatch()` into internal `TradeMatch` records.
6) Pages/chunks are merged, sorted by newest submission index, and deduplicated at trade identity level.
7) Volumes are computed from `quote_filled`:
   - `perp_volume_usd = sum(abs(quote_filled) where is_perp)`
   - `spot_volume_usd = sum(abs(quote_filled) where !is_perp)`
   - `total_volume_usd = perp + spot`
8) Trading PnL uses PERP only (closing trades): `sum(realized_pnl)` on perp closing fills.
9) Funding PnL uses historical paid amounts (`interest_and_funding` endpoint, paginated by `max_idx`).
10) Final stats (`WalletStats`) are rendered in `WalletSummary` and `WalletStats`.
```

## 12. Next.js API route conventions (Zod)

All Nado proxy routes under `app/api/**/` follow the same pattern:

1. **Incoming body** (POST): `SomeRequestSchema.safeParse(await request.json())` → `400` if invalid.
2. **Call**: `fetch(NADO_GATEWAY_REST | NADO_ARCHIVE_REST, { headers: { Accept-Encoding: gzip, br, deflate } })`.
3. **Response**: `parseArchiveJson(ResponseSchema, raw)` (`lib/api/validateResponse.ts`) → `502` if shape invalid.
4. **Client response**: Already validated JSON (types = `z.infer<>`).

Shared helper: `lib/api/validateResponse.ts` — `parseArchiveJson(schema, raw)`.

---

## 13. Nanosecond timestamps & all-time stats

Trade `timestamp` fields are **nanoseconds** as decimal strings (~1e18). **`parseInt` / `Number` exceed `MAX_SAFE_INTEGER`** → wrong dates or "future".

- Safe conversion: `lib/wallet/nanoTime.ts` → `nanoStringToMs` / `nanoStringToUnixSec` (BigInt).
- **First / last trade**: derived from min/max `submission_idx` trades, not array edges (after `sortTradesNewestFirst`).

While `trades_complete === false` (matches pagination in progress), **volumes / fees / aggregated PnL / first-last trade** are **not** displayed (UI `—`) to avoid partial amounts changing with each page.

---

## Checklist Validation (10 lines)

- Subaccounts count matches archive response for the wallet.
- Chunking is active when subaccounts > 5.
- Each chunk paginates until final page (`< 500`) or safety cap.
- No trade loss at page boundaries (idx overlap handled).
- No duplicate trade inflation after merge.
- `perp_volume_usd + spot_volume_usd === total_volume_usd`.
- Perp/Spot volumes match Nado official UI on known wallet.
- Trading PnL changes only with perp closing trades.
- Funding PnL is built from historical `funding_payments.amount` (not funding-rate snapshot).
- UI renders without chart ordering assertion errors.
