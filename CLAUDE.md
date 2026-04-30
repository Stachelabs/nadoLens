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
- Routes: `/api/pairs` · `/api/wallet/[address]` · `/api/matches` · `/api/funding` · `/api/snapshots`
- **ALWAYS** validate all bodies and external responses with Zod `safeParse()`

**WS Proxy + nado-matches (Fly.io fra — Bun, co-located)**
- Region **fra** (Frankfurt) — EU IPs required, Nado blocks US East
- Use `ws` package (not native Bun WebSocket) — Nado requires `permessage-deflate`
- Ping every 30s: `{ method: "ping" }` | `id` field required in every subscribe message
- `min_machines_running = 1` — machine never sleeps, WS connection stays alive permanently
- Exposes both `POST /matches` (Redis-cached Archive proxy) and `GET /sse` (SSE → browser)
- SSE clients register via `?subaccount=<bytes32>` — fill events routed per subaccount
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

## Git

Format: `feat(wallet): add equity curve` · `fix(ws-proxy): reconnect backoff`

**ALWAYS** branch `feat/` or `fix/` — **NEVER** commit to `main`. Branch → Vercel Preview → test → merge PR.

---

## MVP priorities

1. ✅ WS Proxy Bun + `/health`
2. ✅ `useLiquidationStream` SSE → Zustand
3. ✅ Heatmap layer 1 + layer 2
4. ✅ Survival Cockpit
5. ✅ Wallet Explorer
6. **→ Deploy & Polish** (README, GIF, GitHub public, email Frank)
7. Orderbook depth (post-polish)

---

_CLAUDE.md v4.0 — NadoLens_
