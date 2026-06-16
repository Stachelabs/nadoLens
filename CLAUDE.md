# CLAUDE.md — NadoLens

> Working rules only. Full spec → PRD.md | Business context → About.md | Local workflow → CLAUDE.local.md

---

## References

| Doc | Content |
|---|---|
| PRD.md | Full spec, phases, roadmap |
| ARCHI.md | Wallet Explorer architecture, data flow, components |
| About.md | Business context, hosting, Frank pitch |
| lib/schemas/nado.ts | **Source of truth for types** — Zod schemas |

---

## Branch Workflow — STRICT

**NEVER** commit directly to `main`. Always:
1. Create `feat/` or `fix/` branch
2. Push branch → open PR with `gh pr create`
3. **STOP** — do not merge to main without explicit user approval

Violations: direct commits to main, pushing merges without PR review = always wrong.

---

## Context7 — live library docs

**ALWAYS use Context7 — NEVER rely on memory for libraries.**

Priority IDs:
```
/vercel/next.js          /wevm/wagmi       /wevm/viem
/pmndrs/zustand          /tradingview/lightweight-charts
/colinhacks/zod/v4.0.1   /rainbow-me/rainbowkit   /recharts/recharts
```

> Recharts = dashboard charts (stats, bars, lines). TradingView = price/candlesticks only.

---

## Package managers

| Scope | Manager |
|---|---|
| Next.js app | **pnpm** |
| `services/nado-matches/` | **Bun** |
| `services/nado-funding/` | **Bun** |

---

## Stack

Next.js 16 · TypeScript strict · Tailwind v4 · shadcn/ui · Recharts 3 · Zustand 5 · wagmi 2 · viem 2 · RainbowKit 2 · Zod 4 · sonner

---

## TypeScript rules

- **NEVER** use `any` — always type explicitly
- **NEVER** use `as unknown as X` — redesign the type
- **ALWAYS** use `lib/schemas/nado.ts` (`z.infer<>`) — never re-declare Nado types elsewhere
- **ALWAYS** use `fromX18BigInt(val: string): number` (`types/nado.ts`) for x18 conversions — BigInt, never parseFloat

---

## Architecture rules

**Client (browser)**
- React + Zustand stores | EIP-712 signing via wagmi/viem — **NEVER server-side**
- SSE via `EventSource` to WS Proxy (`NEXT_PUBLIC_WS_PROXY_URL`)

**Next.js server (Vercel)**
- Routes: `/api/pairs` · `/api/wallet/[address]` · `/api/positions_matches` · `/api/global_matches` · `/api/positions_funding` · `/api/global_funding` · `/api/snapshots` · `/api/subaccounts/[address]` · `/api/status`
- Protocol routes: `/api/protocol/tickers` · `/api/protocol/market-snapshots` · `/api/protocol/products` · `/api/protocol/candlesticks` · `/api/protocol/funding-rates` · `/api/protocol/insurance-fund`
- **ALWAYS** validate all bodies and external responses with Zod `safeParse()`
- **ALWAYS** wrap API route handlers in `try/catch` → `categorizedErrorResponse(e, routeLabel)` (timeout→504, network/parse→502, unknown→500)
- **ALWAYS** add `signal: AbortSignal.timeout(10_000)` to every upstream `fetch()` call
- **ALWAYS** use `withArchiveRetry()` for direct Archive fetches (handles 429 + exponential backoff)
- **ALWAYS** use `withTransientRetry()` for Fly.io services (matches, funding) and Gateway one-shots (products, insurance-fund) — defaults: 2 attempts, 500ms backoff; wallet routes use maxAttempts: 3
- **ALWAYS** fail-fast if required env vars are missing (`SERVICE_SECRET`, etc.) — never `?? ""`
- Products + insurance-fund routes: stale cache fallback (`lastGood*` module variable) with `x-nadolens-fallback` header on failure
- Shared utilities: `lib/api/apiErrorResponse.ts` · `lib/api/withTransientRetry.ts` · `lib/archiveRetry.ts` · `lib/api/validateResponse.ts`

**WS Proxy + nado-matches (Fly.io fra — Bun, co-located)**
- Region **fra** (Frankfurt) — EU IPs required, Nado blocks US East
- Use `ws` package (not native Bun WebSocket) — Nado requires `permessage-deflate`
- Ping every 30s: `{ method: "ping" }` | `id` field required in every subscribe message
- `min_machines_running = 1` — machine never sleeps, WS connection stays alive permanently
- Exposes `POST /matches` (Archive proxy, Upstash Redis cache with TTL) · `GET /sse` (SSE → browser) · `GET /health`
- **Token bucket**: In-memory sliding window rate limiter — 350 weight/10s budget, `X-NadoLens-Queued: true` header when wait > 2s, max 15s wait
- Redis cache: Archive `/matches` responses cached by request hash — `no_cache` flag bypasses TTL
- Static market subscriptions on startup: `liquidation` stream + `book_depth` for all products
- SSE clients register via `?subaccount=<bytes32>` — fill events routed per subaccount; subscriptions re-registered on WS reconnect
- Client-side: `hooks/useAccountStream.ts` — EventSource with exponential-backoff reconnect

**Vercel build**
- Build script: `"build": "next build"`
- Turbopack by default: `turbopack: {}` in `next.config.ts`
- Wallet SDK externals: `config.externals.push('pino-pretty', 'lokijs', 'encoding')`

**NEVER**
- ❌ Private key in browser or Next.js code
- ❌ Server-side signing
- ❌ `console.log` payloads with addresses or signatures
- ❌ Commit `.env`, `.env.local`, `About.md`

---

## Nado API

Docs in `docs/api/` — use the right file:

| Task | File |
|---|---|
| History, pagination, PnL, fees, volume | `docs/api/NADO_ARCHIVE_API.md` |
| Entry price (account_snapshots) | `docs/api/NADO_ARCHIVE_API.md` |
| Real-time: positions, prices | `docs/api/NADO_GATEWAY_API.md` |
| Margin types, health, fees, x18, bytes32 | `docs/api/NADO_CONCEPTS.md` |
| 429, backoff, rate limits, polling budget | `docs/api/NADO_RATE_LIMITS.md` |

### RAG — mandatory before any Nado API work

**ALWAYS query the RAG before writing code that touches a Nado endpoint:**
```bash
pnpm docs:query:nado "<question>"
# Ex: pnpm docs:query:nado "fee calculation matches archive"
# Ex: pnpm docs:query:nado "pagination idx" --top-k 3
```
Rebuild index: `pnpm docs:build:nado`

### Critical rules

- **CRITICAL**: `totalFees = fee` — `fee` already includes all fees. **NEVER** sum `sequencer_fee` on top
- **CRITICAL**: `realized_pnl` — only count if `closed_amount !== 0`
- **ALWAYS**: `isolated: null` in matches body — captures both cross AND isolated
- **ALWAYS**: x18 via `BigInt`, never `parseFloat` on large numbers
- Fetch ALL subaccounts (default + isolated) before fetching matches
- Matches pagination: `idx = page[page.length - 1].submission_idx`, stop if `page.length < 500`
- Safety cap: `MAX_PAGES = 50` — never paginate beyond 25 000 matches per load
- Burst delay: `MATCHES_BURST_MS = 220` between consecutive Archive calls — prevents 429s

### Isolated margin — parent vs pocket

- **Parent** (`default_1`): signs orders. Archive `matches` attach fills to `order.sender` = parent
- **Pocket** (different bytes32): real ledger — `subaccount_info` on pocket exposes `perp_balances`
- **IMPORTANT**: `isolated_positions(parent)` → lists entries with `data[].subaccount` = pocket bytes32. On pocket itself: often empty
- App: VWAP/entry from `matches` → aggregate by parent. Size/quote from Gateway → pocket
- **NEVER** mix parent and pocket bytes32 without the mapping

### Critical constants

```typescript
chainId: 57073                                        // Ink L2 mainnet
contract: "0xf8963f7860af7de9b94893edb9a3b5c155e1fc0c"

// addressToSubaccount
const addr = address.toLowerCase().replace("0x", "")
const nameHex = Buffer.from(name).toString("hex").padEnd(24, "0")
return `0x${addr}${nameHex}`                          // default name = "default"

// WS — ALWAYS use prod endpoints (gateway.nado.xyz = dead 404)
Gateway:   wss://gateway.prod.nado.xyz/v1/ws
Subscribe: wss://gateway.prod.nado.xyz/v1/subscribe
REST:      https://gateway.prod.nado.xyz/v1 (v2)
Archive:   https://archive.prod.nado.xyz/v1 (v2) — POST JSON
```

### API quirks

- `/v2/tickers` and `/v2/trades` return **normal decimals** (NOT x18)
- `book_depth` = diffs — size `"0"` = level removed from the order book
- `product_id: null` on liquidation stream = all pairs

---

## Component rules

- One component = one file = one responsibility | `PascalCase.tsx` · `camelCase.ts` hooks/libs
- **ALWAYS** use shadcn/ui for basic UI — exceptions: `<canvas>`, layout divs, stateless semantic wrappers
- **CRITICAL**: `Button` uses `@base-ui/react/button` → **no `asChild` prop**
  For link-as-button: `<Link className={cn(buttonVariants({ variant, size }))}>`
- **ALWAYS** use `role="tablist"` + `role="tab"` + `aria-selected` on custom tab navigation
- **ALWAYS** use AbortController in hooks that fetch — pass `signal` to every `fetch()`, abort in cleanup
- **NEVER** mutate input arrays (`.sort()`) — always spread first: `[...arr].sort()`
- **NEVER** use `(e as Error)` in catch blocks — use `e instanceof Error` guard instead
- **WalletBanner**: 5 banner types (WHALE_LOADING, QUEUE_WAIT, RETRY_IN_PROGRESS, RETRY_EXHAUSTED, RECOVERY). Max 2 visible. CSS fade transitions. Derives state from `useWalletData` `bannerState` field

---

## Theme

| Token | Usage |
|---|---|
| `text-foreground` / `text-muted-foreground` | Primary / secondary text |
| `bg-background` / `bg-card` | Page / card background |
| `text-primary` / `bg-primary` | Emerald #22c55e |
| `text-destructive` | Red #ef4444 |

Custom: `var(--bull)` green · `var(--bear)` red · `var(--warn)` orange

next-themes: `ThemeProvider` outside `Providers` · `suppressHydrationWarning` on `<html>`
RainbowKit: accent `#a855f7` · `locale="en"` · `coolMode` · `mounted` guard in Providers

---

## Scripts

### `pnpm run icons:sync-nado-perps`

Syncs perp + spot market SVG icons from app.nado.xyz (Playwright Chromium, headless by default).
Market list from Gateway `GET /v2/assets`; assets fetched from `/_next/static/media/*.svg`.

Outputs:
- Perps → `public/icons/perps/{BASE}.svg` + `manifest.json`
- Spot → `public/icons/spot/{symbol.toLowerCase()}.svg` + `manifest.json`

Spot app routes use `spotDisplaySymbol` (e.g. Gateway `KBTC` → `?market=kBTC/USDT0`, `wQQQx` → `?market=QQQx/USDT0`).
After syncing new spot icons, update `lib/spotMeta.ts` manually (`visible`, icon paths, colors).

First run may need `pnpm exec playwright install chromium`.

Env overrides (optional):
`ICONS_KIND=perp|spot|all` (default `all`) · `ICONS_ONLY=BTC,wQQQx` · `NADO_GATEWAY_V2` ·
`ICONS_OUTPUT_DIR` · `ICONS_SPOT_OUTPUT_DIR` · `PLAYWRIGHT_HEADED=1` · `ICONS_DELAY_MS=2000` · `ICONS_DEBUG=1`

---

## Git

Format: `feat(wallet): add equity curve` · `fix(ws-proxy): reconnect backoff`

**ALWAYS** branch `feat/` or `fix/` — **NEVER** commit to `main`. Branch → Vercel Preview → test → merge PR.

---

## MVP priorities

1. ✅ WS Proxy Bun + `/health`
2. ❌ `useLiquidationStream` SSE → Zustand — **removed** (liquidations served via REST polling in Protocol tab instead)
3. ❌ Heatmap layer 1 + layer 2 — **removed** (see PRD.md § 10 roadmap)
4. ❌ Survival Cockpit — **removed** (see PRD.md § 10 roadmap)
5. ✅ Wallet Explorer
6. ✅ Protocol Analytics Dashboard — 5 tabs: Overview · Volumes · OI & Funding · Revenue · TVL
7. ✅ Deploy & Polish — partially done (codebase audit done, README redesign in progress)
8. Orderbook depth (post-polish)

---

_CLAUDE.md v4.4 — NadoLens — updated 2026-06-08_
