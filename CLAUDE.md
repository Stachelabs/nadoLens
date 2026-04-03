# CLAUDE.md — NadoLens

> Working rules only. Full spec → PRD.md | Business context → About.md

---

## References

| Doc                 | Content                                              |
| ------------------- | ---------------------------------------------------- |
| PRD.md              | Full spec, phases, roadmap                           |
| ARCHI.md            | Wallet Explorer architecture, data flow, components  |
| About.md            | Business context, hosting, Frank pitch               |
| lib/schemas/nado.ts | **Source of truth for types** — Zod schemas          |

---

## Context7 — live library docs

**Always use Context7 — never rely on memory for libraries.**

Priority IDs:

```
/vercel/next.js          /wevm/wagmi       /wevm/viem
/pmndrs/zustand          /prisma/prisma    /tradingview/lightweight-charts
/colinhacks/zod/v4.0.1   /rainbow-me/rainbowkit   /recharts/recharts
```

> ⚠️ Recharts = dashboard charts (stats, bars, lines) — NOT for price/trading charts.
> TradingView Lightweight Charts = price charts/candlesticks only.

---

## Package managers

| Scope                  | Manager  | Reason                                       |
| ---------------------- | -------- | -------------------------------------------- |
| Next.js app            | **pnpm** | Standard, compat with shadcn/prisma/wagmi    |
| WS Proxy (`ws-proxy/`) | **Bun**  | Native WS runtime, long-running process      |

---

## Stack

Next.js 16 · TypeScript strict · Tailwind v4 · shadcn/ui · Zustand 5 · wagmi 2 · viem 2 · RainbowKit 2 · TradingView Lightweight Charts v5 · Zod 4 · Prisma 5 · Neon

---

## Working method — APEX

```bash
/apex -i implement <description>       # interactive — validate plan before coding
/apex -a -s implement <description>    # auto + save
/apex -a -s -e implement <description> # economy — fewer tokens
```

Sonnet 4.6 by default. Switch to Opus 4.6 (`/model opus`) only when Sonnet goes in circles on a complex architecture problem.

---

## TypeScript rules

- Zero `any` — always type explicitly
- Zero `as unknown as X` — if needed, the type is poorly designed
- Nado types → `lib/schemas/nado.ts` (`z.infer<>`) — never re-declare elsewhere
- `fromX18BigInt(val: string): number` in `types/nado.ts` for all conversions (BigInt, not parseFloat)

---

## Architecture rules

**Client (browser)**

- React rendering + Zustand stores
- EIP-712 signing via wagmi/viem — never server-side
- SSE via `EventSource` to WS Proxy Railway (use `NEXT_PUBLIC_WS_PROXY_URL`)

**Next.js server (Vercel)**

- `/api/pairs` — list of Nado pairs
- `/api/wallet/[address]` — Nado Gateway proxy (avoids CORS)
- `/api/matches` — Archive `matches` proxy (chunk <= 5 subaccounts + client-side idx pagination)
- `/api/funding` — Archive `interest_and_funding` proxy (client-side max_idx pagination)
- `/api/snapshots` — Archive `account_snapshots` proxy (entry prices)
- Validate all bodies and external responses with Zod `safeParse()`

**WS Proxy (Railway — Bun)**

- Region **eu-west4** (Netherlands) REQUIRED — US East IPs blocked by Nado
- Use the `ws` package (not native Bun WebSocket) — Nado requires `Sec-WebSocket-Extensions: permessage-deflate`
- Ping every 30s: `{ method: "ping" }`
- `id` field required in every subscribe message

**Vercel build**

- Build script: `"build": "prisma generate && next build"`
- Next.js 16 uses **Turbopack by default** — `turbopack: {}` in `next.config.ts`
- Wallet SDKs (MetaMask, WalletConnect): `config.externals.push('pino-pretty', 'lokijs', 'encoding')` in webpack (fallback `--webpack`)
- `ws-proxy/` excluded from main tsconfig

**Never**

- ❌ Private key in Next.js code or in the browser
- ❌ Server-side signing
- ❌ `console.log` payloads with addresses or signatures
- ❌ Commit `.env`, `.env.local`, `About.md`

---

## Nado API documentation

Nado API documentation is available in the `docs/api/` folder.
Refer to the appropriate file based on the current task:

| Task | File |
|---|---|
| History fetch (matches, orders, subaccounts, pagination, PnL/fees/volume calculation) | `docs/api/NADO_ARCHIVE_API.md` |
| Average entry price (account_snapshots, net_entry_unrealized) | `docs/api/NADO_ARCHIVE_API.md` |
| Real-time queries (subaccount info, open positions, products, prices) | `docs/api/NADO_GATEWAY_API.md` |
| Concepts (margin types, health, PnL settlement, fees, bytes32 format, x18) | `docs/api/NADO_CONCEPTS.md` |
| 429 handling, backoff, errors, rate limits, changelog | `docs/api/NADO_RATE_LIMITS.md` |

### RAG — mandatory before any Nado API work

**Before writing any code that touches a Nado endpoint, always query the RAG first:**

```bash
pnpm docs:query:nado "<question>"
# Ex: pnpm docs:query:nado "fee calculation matches archive"
# Ex: pnpm docs:query:nado "pagination idx" --top-k 3
# Ex: pnpm docs:query:nado "rate limits" --filter /developer-resources/api
# Ex: pnpm docs:query:nado "subaccount_info weight rate limit" --filter /developer-resources/api/gateway
# Ex: pnpm docs:query:nado "account_snapshots weight" --filter /developer-resources/api/archive-indexer
```

This applies to: new endpoints, rate limit questions, request/response shapes, pagination, weight calculations.
The RAG indexes the live `docs.nado.xyz` — always more accurate than memory.

Rebuild the index: `pnpm docs:build:nado` (crawl + embed + verify)

### Critical rules (always follow)

- x18 conversion: always via `BigInt`, never `parseFloat` on large numbers
- `realized_pnl`: only count if `closed_amount !== 0`
- `totalFees = fee` (`fee` already includes taker/maker + sequencer — `sequencer_fee` = breakdown only, do NOT sum)
- Fetch subaccounts: retrieve ALL subaccounts (default + isolated) before fetching matches
- `isolated: null` in matches body to capture both cross AND isolated
- Matches pagination: `idx = page[page.length - 1].submission_idx`, stop if `page.length < 500`

### Isolated margin — parent vs pocket (two bytes32)

- **Parent** (e.g. `default_1`): the one that **signs** orders. The **Archive `matches`** attaches fills to `order.sender` = **parent** (the pocket has no matched history at this bytes32).
- **Pocket** (auto-created, different bytes32): **real ledger** — `subaccount_info` on the **pocket** exposes `perp_balances` of the isolated product; on the **parent**, the same `product_id` may be at **amount 0** (position moved to the pocket).
- **`isolated_positions` query on parent**: lists entries with `data[].subaccount` = **pocket** bytes32 + `product_id` / balances. **On the pocket**: response often **empty** (not the listing anchor).
- **App**: **avg entry / VWAP from `matches`** → aggregate by **parent** (and filter by product / `isolated`). **Size / quote** from Gateway → `subaccount_info` **pocket** or chaining via `isolated_positions(parent)` → pocket for the `product_id`. Do not mix the two bytes32 without this mapping.

---

## Component rules

- One component = one file = one responsibility
- `PascalCase.tsx` components — `camelCase.ts` hooks and libs
- Hooks → `hooks/` prefixed with `use` | Stores → `store/` suffixed with `Store`
- **shadcn/ui required** for all basic UI elements
- Exceptions — native HTML allowed: `<canvas>`, layout divs, stateless semantic wrappers

**shadcn/ui — critical constraint**

- `Button` uses `@base-ui/react/button` → **no `asChild` prop**
- For a link styled as button: `<Link className={cn(buttonVariants({ variant, size }))}>`
- Never `<Button asChild><Link>` — does not compile

---

## NadoLens theme

| Token                         | Usage             |
| ----------------------------- | ----------------- |
| `text-foreground`             | Primary text      |
| `text-muted-foreground`       | Secondary text    |
| `bg-background`               | Page background   |
| `bg-card`                     | Card background   |
| `border-border`               | Borders           |
| `text-primary` / `bg-primary` | Emerald #22c55e   |
| `text-destructive`            | Red #ef4444       |

Semantic custom: `var(--bull)` green · `var(--bear)` red · `var(--warn)` orange

**next-themes**: `ThemeProvider` outside `Providers` in `layout.tsx`. `suppressHydrationWarning` on `<html>`.

**RainbowKit**: accent purple `#a855f7` · `locale="en"` · `coolMode` · `mounted` guard in Providers to avoid hydration mismatch.

---

## Nado API — critical reminders

- Chain ID Ink L2 mainnet: **57073** (wagmi/viem) — do not confuse with other IDs
- Contract endpoint: `0xf8963f7860af7de9b94893edb9a3b5c155e1fc0c`
- Values in **x18** → `fromX18BigInt()` for financial aggregations (volume, fees, pnl)
- ⚠️ **V2 Exception**: `/v2/tickers` and `/v2/trades` return **normal decimals**, NOT x18
- Subaccount bytes32: `0x{address}64656661756c740000000000` (default)
- `product_id: null` on `liquidation` stream = all pairs
- `book_depth` = diffs — size `"0"` = level removed from the order book
- Mainnet WS Gateway: `wss://gateway.prod.nado.xyz/v1/ws` (queries/executes)
- Mainnet WS Subscribe: `wss://gateway.prod.nado.xyz/v1/subscribe` (real-time streams)
- Gateway v1 REST: `https://gateway.prod.nado.xyz/v1` | v2: `https://gateway.prod.nado.xyz/v2`
- Archive v1: `https://archive.prod.nado.xyz/v1` | v2: `https://archive.prod.nado.xyz/v2` (POST JSON — not REST)
- ⚠️ `gateway.nado.xyz` and `archive.nado.xyz` are dead (404)

### addressToSubaccount — critical helper

```typescript
function addressToSubaccount(
  address: string,
  name: string = "default",
): string {
  const addr = address.toLowerCase().replace("0x", "");
  const nameHex = Buffer.from(name).toString("hex").padEnd(24, "0");
  return `0x${addr}${nameHex}`;
}
```

### Rate limits — Wallet Explorer

- `subaccounts` archive: IP weight 2 (1× on load)
- `account_snapshots` archive: IP weight 2 (1× on load, for entry prices)
- `matches` archive: IP weight 2+(limit×subaccounts/10) → limit=500, 1 sub = weight 52 (1× on load)
- `subaccount_info`: IP weight 2 × nb_subaccounts → 30s polling OK
- Total on initial load: ~56 weight → safe with 2400/min max

---

## Git

Format: `feat(wallet): add equity curve` · `fix(ws-proxy): reconnect backoff`

Always a `feat/` or `fix/` branch — never commit to `main`. Each branch → Vercel Preview → test → merge PR.

---

## MVP priorities — strict order

1. ✅ WS Proxy Bun + `/health`
2. ✅ `useLiquidationStream` SSE → Zustand
3. ✅ Heatmap layer 1 + layer 2 → layer 3 (book_depth zones, optional)
4. ✅ Survival Cockpit complete
5. ✅ **Wallet Explorer** (`/wallet/[address]`) — fresh install, components restored
6. **→ Deploy & Polish** (README, GIF, push GitHub public, email Frank)
7. Orderbook depth (post-polish)

---

_CLAUDE.md v2.4 — NadoLens_
