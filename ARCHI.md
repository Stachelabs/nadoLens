# ARCHI.md — NadoLens Architecture
> Technical architecture for the Wallet Explorer (`/wallet/[address]`) and Protocol Analytics (`/protocol`)

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
  │         Merge: all positions + sum equity + per-subaccount health scores
  │
  ├── 3. fetch archive.prod.nado.xyz/v1 (account_snapshots — on fill detection)
  │         POST { account_snapshots: { subaccounts: [cross_bytes32], limit: N } }
  │         → avg entry prices (net_entry_unrealized) keyed by parent bytes32
  │
  └── 4. fetch archive.prod.nado.xyz/v1
            POST { matches: { subaccounts: [all_bytes32], limit: 500, isolated: null } }
            → trade history with realized_pnl, fees, sequencer_fee

Results → WalletStats parsed in useWalletData
         → wallet components (WalletHeader, WalletStats, WalletPositions, etc.)

Refresh strategy:
  - Positions: 6s polling via setInterval (all subaccounts via subaccountsRef)
  - Isolated pocket discovery: every 6 poll ticks (≈36s) via isolated_positions(parent)
  - Trade history: initial fetch + incremental on fill detection (WS or poll fallback)
  - WS fill stream (useAccountStream → /sse on nado-matches): immediate trigger for
    fetchSnapshotEntryPrices + fetchIncrementalTrades + sonner toast (< 1s latency)
  - Poll fill detection (pollDetectedFill): fallback when WS is down — still fires on 6s tick
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

### `/api/positions_matches/route.ts`
Position-scoped matches proxy. Single subaccount + required product_ids. No Redis cache.

```
POST /api/positions_matches
  body: { subaccounts: [string] (exactly 1), product_ids: number[] (1+), limit?: 1-250, idx?: string, isolated?: null }
  withTransientRetry maxAttempts: 3
  AbortSignal.timeout(15_000)
  → Fly.io matches service → Archive
  → { matches: [...], txs: [...] }
```

### `/api/global_matches/route.ts`
Global matches proxy with Redis incremental cache (soft TTL 5s, hard 300s).

```
POST /api/global_matches
  body: { subaccounts: string[] (1-5), limit?: 1-250, idx?: string, isolated?: null, no_cache?: boolean }
  withTransientRetry maxAttempts: 3
  AbortSignal.timeout(15_000)
  First-page requests: Redis incremental merge cache (VHIT/VSTALE/VINCR-NEW)
  → Fly.io matches service → Archive
  → { matches: [...], txs: [...] }
```

### `/api/positions_funding/route.ts`
Position-scoped funding proxy for open positions.

```
POST /api/positions_funding
  body: { subaccount: string, product_ids: number[] (1+), limit?: 1-100, max_idx?: string }
  withTransientRetry maxAttempts: 3
  AbortSignal.timeout(15_000)
  → Fly.io funding service → Archive
  → { funding_payments: [...], interest_payments: [...], next_idx }
```

### `/api/global_funding/route.ts`
Global funding proxy for full history.

```
POST /api/global_funding
  body: { subaccount: string, product_ids: number[] (1+), limit?: 1-100, max_idx?: string }
  withTransientRetry maxAttempts: 3
  AbortSignal.timeout(15_000)
  → Fly.io funding service → Archive
  → { funding_payments: [...], interest_payments: [...], next_idx }
```

### `/api/snapshots/route.ts`
Archive proxy for `account_snapshots` with Zod validation. Used to retrieve avg entry prices.

```
POST /api/snapshots
  body: { subaccounts: string[], limit?: number }
  → POST https://archive.prod.nado.xyz/v1
     body: { account_snapshots: { subaccounts, limit } }
  → { account_snapshots: [...] }

Triggered: on fill detection (prevAmount changed) — not every poll.
Key field: net_entry_unrealized (x18) → avg entry price per product per parent subaccount.
```

### `/api/protocol/insurance-fund/route.ts`
Gateway proxy for insurance fund balance. Returns total insurance fund value in USD.

```
GET /api/protocol/insurance-fund
  → POST https://gateway.prod.nado.xyz/v1/query
     body: { type: "insurance" }
  → { total: number }

Zod validation: InsuranceFundResponseSchema
ISR cache: revalidate: 60 (1min)
```

### `/api/status/route.ts`
Health check endpoint. Pings WS Proxy and Nado Gateway, returns aggregate status.

```
GET /api/status
  → Parallel ping: WS Proxy /health + Nado Gateway
  → { status: "online"|"degraded"|"offline", services: { api, wsProxy, nado }, timestamp }

Zod validation: StatusResponseSchema (inline)
Cache: force-dynamic (no ISR) — Nado ping cached in-memory 5min
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
  error: string | null        // set on fetch failure — components can check
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
  WalletHeader.tsx        Props: { stats: WalletStats }                        ← address, equity, available margin
  WalletSpotBalances.tsx  Props: { balances: SpotBalance[] }                   ← USDT0/KBTC/WETH/USDC/NLP balances
  WalletStats.tsx         Props: { stats: WalletStats }                        ← win rate, PnL, volume, avg size
  WalletPositions.tsx     Props: { positions, subaccountHealths, onRefreshUnrealized, unrealizedRefreshing }
                                                                                ← open positions + per-position health badge + unrealized PnL
  WalletSummary.tsx       Props: { stats, globalMatchesComplete, onRefresh, refreshing }
                          + store selectors: globalFundingComplete, globalFundingLoading, loadGlobalFunding
                                                                                ← global PnL summary (trading + funding + fees)
  WalletTradeHistory.tsx  Props: { trades: TradeMatch[] }                      ← last N trades history
  WalletEquityCurve.tsx          Props: { trades, globalMatchesComplete }
                                 + store selectors: fundingPayments, fundingLoadedSince   ← Recharts equity curve
  WalletFeesByProductChart.tsx   Props: { trades }                                    ← Recharts fee breakdown by product (Analytics tab)
  WalletFundingByProductChart.tsx No props — reads store directly                     ← Recharts funding breakdown by product (Analytics tab)
  WalletTabNav.tsx               Props: { activeTab, onTabChange }                   ← tab navigation (Positions / History / Analytics)
  AccountFilterSelect.tsx        Props: { options, value, onValueChange }             ← subaccount filter dropdown (positions, trades, spot)

hooks/
  useWalletData.ts        ← multi-subaccount fetch + 6s polling → WalletData (orchestrates trades, positions, snapshots)
  useWalletFunding.ts     ← thin lifecycle hook — initForAddress + abort on address change
  useAccountStream.ts     ← EventSource to /sse, exponential-backoff reconnect, fill → onFill callback
  usePairs.ts             ← triggers pairsStore.init() on mount (via PairsInitializer)
  useAccount.ts           ← wagmi useAccount wrapper (connected wallet)

store/
  walletFundingStore.ts ← Zustand (no persist) — funding data owner, two distinct flows:
                          1. Position-scoped: fetchPositionScopedFunding() → positionFundingPayments[]
                             Auto-loaded Phase 2b, funding only for open positions (stops at openTime)
                             Used by: WalletPositions Funding column
                          2. Global: loadFundingForPeriod(period) / loadGlobalFunding()
                             → fundingPayments[] + fundingPaidUsd
                             Delta fetch with per-subaccount cursors, inflight dedup
                             Used by: WalletSummary, WalletEquityCurve, WalletFundingByProductChart
  pairsStore.ts                ← Zustand + persist — V2 assets, byId Map, perp[], spot[]
  protocolStore.ts             ← Zustand — protocol tab state, tickers, liquidations feed
  protocolCacheStore.ts        ← Zustand — market snapshot cache with TTL (5min), inflight dedup
  walletMatchesCacheStore.ts   ← Zustand — per-wallet trade matches cache (LRU, max 2 wallets)
  positionMatchesCacheStore.ts ← Zustand — per-wallet position-scoped matches + open-time map (LRU, max 2 wallets)
  walletAnalyticsStore.ts      ← Zustand — wallet tab state + selected funding product filter

lib/wallet/
  fetchWalletFunding.ts ← pure fetch functions: fetchFundingBySubaccount, fetchFundingAllSubaccounts, fetchPositionScopedFunding

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
| Health | `subaccount_healths[].health_score` — per-position badge (emerald/orange/red) |
| Side | `perp_balances[i].balance.amount`: positive=LONG, negative=SHORT |
| Size | `abs(fromX18BigInt(amount))` |
| Avg Entry | `account_snapshots[].net_entry_unrealized` (x18) — fetched on fill detection |
| Mark Price | `fromX18BigInt(oracle_price_x18)` |
| Unrealized PnL | `(mark_price − avg_entry) × amount` where `avg_entry = \|net_entry_unrealized / amount\|` from `account_snapshots` — see `lib/wallet/snapshotEntryPrice.ts`. Fallback to Gateway `v_quote + amount × oracle` when no snapshot available. |
| Liq Price | estimated: `markPrice × (1 ± 1/leverage + maintMarginRate)` |
| Realized | cumulative realized PnL for the open session (from positionStats via matches) |
| Funding | cumulative funding paid/received (from interest_and_funding) |
| Fees | cumulative fees for the open session (from positionStats via matches) |

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
| Positions / Health | Polling `/api/wallet/[subaccount]` | 6s |
| Isolated pocket discovery | `isolated_positions(parent)` every 6 poll ticks | ≈36s |
| Fill detection (WS) | `useAccountStream` → `/sse` on nado-matches | Immediate (< 1s) |
| Fill detection (fallback) | Poll: prev `amount_x18` changed between ticks | 0–6s |
| Avg entry (account_snapshots) | On fill event (WS or poll fallback) | On fill |
| Trade history | Initial fetch + incremental on fill event | On fill |
| Equity curve | Recomputed when `trades` changes | On mount |
| Assets (pairsStore) | Fetch + localStorage persist | TTL 1h |

> WS fill stream (`useAccountStream`) connects to `GET /sse?subaccount=<bytes32>` on nado-matches (Fly.io fra, always-on). The `position_change` stream requires the wallet's private key — impossible for third-party wallet view. 6s polling remains the only source for position metrics.

Why 6s?
- Balances near-live feedback with API rate-limit headroom: `subaccount_info` weight 2 × N subaccounts every 6s stays well within the 2 400/min IP budget even with multiple concurrent users.
- Cannot subscribe to the authenticated WS on a third-party wallet without their signature.
- Can be lowered to 1s for personal/single-user deployments (~10 % of budget).

---

## 9. Rate Limits — Wallet Explorer

| Call | Weight | Frequency |
|---|---|---|
| `subaccounts` (Archive) | 2 | 1× on load + on ↺ refresh |
| `subaccount_info` (Gateway) | 2 × nb_subaccounts | Every 6s |
| `isolated_positions` (Gateway) | 2 × nb_cross_subaccounts | Every ≈36s (pocket discovery) |
| `account_snapshots` (Archive) | 2 | On fill detection only |
| `matches` (Archive, limit=500, paginated) | 2 + (500×nb_subs/10) per page | 1× on load + incremental on fill |
| `interest_and_funding` (Archive) | 2 per page | 1× on load (paginated) |
| Assets `/v2/assets` | — | 1× per hour max (localStorage TTL) |

Total per position poll (2 subaccounts, no discovery tick): ~4 weight → safe with 2400/min max.

---

## 10. Nado Points

Not available via public API. Ignore for MVP → display "—" or hide.

---

## 11. Error Handling & Resilience

### API Routes
All API routes follow these error patterns (hardened in observability pass 2026-06-08):
- **try/catch**: Every route wraps its handler in `try/catch` → `categorizedErrorResponse(e, routeLabel)` which maps timeout→504, network/parse→502, unknown→500. Logs structured `console.error(routeLabel, { category, message, ...context })`
- **Timeout**: `AbortSignal.timeout(10_000)` on every upstream `fetch()` — prevents indefinite hangs
- **Zod validation**: All external responses validated via `safeParse()` before returning to client
- **withArchiveRetry**: Archive fetches (snapshots, subaccounts, candlesticks, funding-rates, market-snapshots) wrapped in `withArchiveRetry()` — retries on 429, exponential backoff, 4 attempts, 300ms base delay
- **withTransientRetry**: Fly.io services (matches, funding) + Gateway one-shots (products, insurance-fund) wrapped in `withTransientRetry()` — retries on 5xx/network/timeout, defaults 2 attempts 500ms backoff; wallet routes use maxAttempts: 3
- **Stale cache fallback**: products + insurance-fund keep `lastGood*` module variable; on failure return cached response with `x-nadolens-fallback` header. Pairs uses hardcoded FALLBACK array. Tickers uses `lastGoodTickers` stale cache
- **SERVICE_SECRET**: matches/funding routes fail-fast if secret is missing (no silent empty string)
- Shared utilities: `lib/api/apiErrorResponse.ts` · `lib/api/withTransientRetry.ts` · `lib/archiveRetry.ts` · `lib/api/validateResponse.ts`

### Client Hooks
- **AbortController**: `useWalletData` and all protocol hooks pass `signal` to every fetch. Cleanup aborts on unmount.
- **Cancelled guards**: Pagination loops check `if (cancelled) break` at each iteration
- **Error propagation**: All hooks expose `error: string | null` to components (including `pairsStore`)

### Error Boundaries
- `app/error.tsx` — root-level catch-all
- `app/protocol/error.tsx` — protocol-specific with retry button
- `app/wallet/[address]/error.tsx` — wallet-specific with retry + go-back
- Wallet page: 30s timeout fallback if `phase1Ready` never resolves

### Accessibility
- Tab navigation (`ProtocolTabNav`, `WalletTabNav`): `role="tablist"` + `role="tab"` + `aria-selected`
- Spinner: `role="status"` + `aria-label="Loading"`

---

## 12. Known Issues

No known bugs. Last reviewed: 2026-05-22.

---

*ARCHI.md v4.2 — NadoLens — updated 2026-06-08*

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

## 13. Next.js API route conventions (Zod)

All Nado proxy routes under `app/api/**/` follow this pattern:

1. **Guard**: Fail-fast if required env vars missing (e.g., `SERVICE_SECRET`).
2. **Incoming body** (POST): `SomeRequestSchema.safeParse(await request.json())` → `400` if invalid.
3. **Fetch** (with retry + timeout):
   - Archive routes → `withArchiveRetry(() => fetch(..., { signal: AbortSignal.timeout(10_000) }))` — retries on 429
   - Fly.io services (matches, funding) → `withTransientRetry(() => fetch(..., { signal: AbortSignal.timeout(15_000) }), { maxAttempts: 3 })` — retries on 5xx/network/timeout
   - Gateway one-shots (products, insurance-fund) → `withTransientRetry()` + stale cache fallback (`lastGood*` + `x-nadolens-fallback` header)
   - Fallback routes (pairs, tickers) → direct fetch with timeout, return cached/hardcoded data on failure
4. **Response**: `parseArchiveJson(ResponseSchema, raw)` or `parseGatewayJson()` → `502` if shape invalid.
5. **Error**: `try/catch` → `categorizedErrorResponse(e, routeLabel)` — timeout→504, network/parse→502, unknown→500. Structured `console.error` with route label + category.
6. **Client response**: Already validated JSON (types = `z.infer<>`).

Shared helpers:
- `lib/api/apiErrorResponse.ts` — `categorizedErrorResponse(e, routeLabel, context?)` — granular status codes + structured logging
- `lib/api/withTransientRetry.ts` — `withTransientRetry(fn, opts?)` — defaults: 2 attempts, 500ms backoff on 5xx/network/timeout; wallet routes override to maxAttempts: 3
- `lib/api/validateResponse.ts` — `parseArchiveJson(schema, raw)`, `parseGatewayJson(schema, raw)`
- `lib/archiveRetry.ts` — `withArchiveRetry(fn, opts?)` — 4 attempts, 300ms base delay, exponential backoff on 429, reads `Retry-After` header

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
