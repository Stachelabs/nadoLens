# PRD — NadoLens
> Full technical spec. Version 2.0.

---

## 1. Official Nado documentation

> Always consult these URLs before coding — do not rely on memory.

| Section | URL |
|---|---|
| General docs | https://docs.nado.xyz |
| API overview | https://docs.nado.xyz/developer-resources/api |
| Gateway endpoints | https://docs.nado.xyz/developer-resources/api/gateway |
| Gateway queries | https://docs.nado.xyz/developer-resources/api/gateway/queries |
| Gateway executes | https://docs.nado.xyz/developer-resources/api/gateway/executes |
| EIP-712 signing | https://docs.nado.xyz/developer-resources/api/gateway/signing |
| WS Streams | https://docs.nado.xyz/developer-resources/api/subscriptions/streams |
| WS Events | https://docs.nado.xyz/developer-resources/api/subscriptions/events |
| Archive (indexer) | https://docs.nado.xyz/developer-resources/api/archive-indexer |
| Trigger API | https://docs.nado.xyz/developer-resources/api/trigger |
| API V2 REST | https://docs.nado.xyz/developer-resources/api/v2 |
| TypeScript SDK | https://docs.nado.xyz/developer-resources/typescript-sdk |
| Formulas / Definitions | https://docs.nado.xyz/definitions-formulas |
| Liquidations | https://docs.nado.xyz/liquidations |
| Margin types | https://docs.nado.xyz/margin-types |
| Subaccounts & Health | https://docs.nado.xyz/subaccounts-and-health |
| API Changelog | https://docs.nado.xyz/developer-resources/api/api-changelog |

---

## 2. Architecture

```
Browser (React)
  └── /wallet/[addr]  → Wallet Explorer (any address)
        │
        │ useWalletData hook (fetch + 30s polling)
        ▼
Next.js Backend (Vercel) — pnpm
  ├── /api/pairs              → proxy Nado pairs list
  └── /api/wallet/[address]   → proxy Nado Gateway queries (avoids CORS)
  ├── /api/matches            → proxy archive matches (Zod validation)
  └── /api/funding            → proxy archive interest_and_funding (Zod validation)

WS Proxy (Railway) — Bun
  ├── GET /health     →  monitoring
  ├── GET /sse        →  SSE → browser (EventSource)
  └── persistent WS   →  wss://gateway.prod.nado.xyz/v1/subscribe
```

**EIP-712 signing client-side only via wagmi/viem.**
Private key never leaves the wallet. Orders sent directly to Nado Gateway.

> Heatmap, dashboard, orderbook features: removed from current build to focus on MVP Wallet Explorer.
> Specs kept in section 8 (roadmap) for future implementation if needed.

---

## 4. Nado API

> **Full reference → `.claude/docs/`** (see `CLAUDE.md` § Nado API documentation for the routing table)
> Do not duplicate here.

> **Isolated margin** (two bytes32: parent vs "pocket", fills `matches` on parent side): rules → `CLAUDE.md` · data flow → `ARCHI.md` · Archive detail → `.claude/docs/NADO_ARCHIVE_API.md`.

---

## 5. Main feature — Wallet Explorer

**Route:** `/wallet` (search) · `/wallet/[address]` (detail)

Analyzes any Nado address — connected wallet or any wallet.

**Displayed data:**

| Section | API Source | Data |
|---|---|---|
| Header | `subaccount_info` | Health score, total equity, available margin |
| Open positions | `subaccount_info` | Pair, side, size, mark price, unrealized PnL, liq price |
| Trade history | archive `matches` via `/api/matches` | Price, qty, realized PnL, fees, timestamp |
| Equity curve | cumulated archive `matches` | TradingView Lightweight Charts — cumulative PnL over time |
| Global stats | `matches` + `interest_and_funding` | Win rate, trading PnL (perp), funding paid, perp/spot/total volume |

**Implemented components:**
```
app/wallet/page.tsx                    ← Search bar + my wallet redirect
app/wallet/[address]/page.tsx          ← Client component — use(params) + useWalletData
components/wallet/
  WalletHeader.tsx                     ← address, health, equity, margin
  WalletStats.tsx                      ← win rate, PnL, volume, avg size
  WalletPositions.tsx                  ← open positions + unrealized PnL
  WalletTradeHistory.tsx               ← last 50 trades
  WalletEquityCurve.tsx                ← TradingView equity curve
hooks/useWalletData.ts                 ← fetch + polling + stats computation
```

**Behavior:**
- URL: `/wallet/0xc5a7...` — address as dynamic parameter
- `isAddress(viem)` validation before navigation + `notFound()` if invalid
- "My Wallet" link in Nav when wallet connected
- Positions refresh every 30s via setInterval (to track health/equity without auth websocket)
- Public data — no auth required

---

## 6. Current project structure

```
nadolens/
├── PRD.md · CLAUDE.md · ARCHI.md
├── package.json                      ← pnpm, scripts: prisma generate && next build
├── next.config.ts                    ← turbopack: {} + webpack externals
├── tsconfig.json                     ← ws-proxy/ excluded
├── app/
│   ├── layout.tsx                    ← ThemeProvider (next-themes) + Providers + Nav
│   ├── page.tsx                      ← redirect to /wallet
│   ├── providers.tsx                 ← WagmiProvider + QueryClient + RainbowKitProvider
│   ├── globals.css                   ← Tailwind v4
│   ├── wallet/
│   │   ├── page.tsx                  ← wallet search
│   │   └── [address]/page.tsx        ← wallet detail (client component)
│   └── api/
│       ├── pairs/route.ts                    ← Nado pairs list
│       ├── wallet/[address]/route.ts         ← Gateway proxy (subaccount_info, etc.)
│       ├── subaccounts/[address]/route.ts    ← address → bytes32 resolution (Archive)
│       ├── matches/route.ts                  ← Archive matches proxy (Zod validation)
│       └── funding/route.ts                  ← Archive interest_and_funding proxy (Zod validation)
├── components/
│   ├── Nav.tsx                       ← sticky nav, connect button, theme toggle
│   ├── ThemeToggle.tsx               ← next-themes toggle
│   ├── wallet/                       ← 5 wallet components
│   └── ui/                           ← shadcn components (button, card, badge, input, table, separator)
├── hooks/
│   ├── useWalletData.ts
│   └── useAccount.ts
├── store/
│   └── accountStore.ts
├── lib/
│   ├── wagmi.ts                      ← inkL2 defineChain (id: 57073) + wagmiConfig
│   ├── nado.ts                       ← NADO_GATEWAY / NADO_ARCHIVE constants
│   ├── db.ts                         ← Prisma client singleton
│   ├── utils.ts                      ← cn()
│   └── schemas/nado.ts               ← Zod schemas (source of truth for types)
├── types/nado.ts                     ← interfaces + fromX18BigInt
├── prisma/schema.prisma
├── scripts/test-api-queries.ts
└── ws-proxy/                         ← Bun, separate package (excluded from main tsconfig)
    ├── index.ts
    ├── package.json
    └── tsconfig.json
```

---

## 7. TypeScript types

> Source of truth: `lib/schemas/nado.ts` (Zod schemas + `z.infer<>`).
> `types/nado.ts` contains `fromX18BigInt`, `RiskLevel`, and domain interfaces (Position, TradeMatch, WalletStats, etc.).

---

## 8. Environment variables

```bash
# .env — never committed (see .env.example for template)
DATABASE_URL=postgresql://...
NADO_GATEWAY_REST=https://gateway.prod.nado.xyz/v1
NADO_ARCHIVE_REST=https://archive.prod.nado.xyz/v1

# WS Proxy Railway (server-side only)
WS_PROXY_URL=https://nadolens-production.up.railway.app

# WS Proxy accessible from browser (NEXT_PUBLIC_ prefix required)
NEXT_PUBLIC_WS_PROXY_URL=https://nadolens-production.up.railway.app
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

---

## 9. Development phases

### ✅ Phase Foundation
Fresh install Next.js 16 + Turbopack + Tailwind v4 + shadcn/ui + wagmi v2 + RainbowKit v2 + viem v2 + Prisma 5 + Zustand 5 + WS Proxy Bun Railway

### ✅ Phase Wallet Explorer
`useWalletData` · WalletHeader · WalletStats · WalletPositions · WalletTradeHistory · WalletEquityCurve · Nav + search + theme toggle

### → Phase Deploy & Polish
- [ ] README + screenshots + demo GIF
- [ ] Prod tests (wallet connection, address search, live positions)
- [ ] Push public GitHub + email Frank

### Phase Orderbook Depth (post-polish)
- [ ] Snapshot `/v2/orderbook` + `book_depth` stream + diff reconstruction
- [ ] Depth chart (bids/asks) + 20-level table + live spread

---

## 10. Post-MVP roadmap

> Features to implement after launch and Frank's feedback.

**Liquidation Heatmap** (feature removed from current build)
- `liquidation` stream → Neon DB → historical replay + TradingView bubbles
- Estimated OI layer (archive `/v2/trades` → entry price distribution)
- `book_depth` layer — fine liquidity zones

**Survival Cockpit** (feature removed from current build)
- Connected wallet dashboard: HealthBar, MarginShield, PredictiveSafety, PnLFlash
- Requires authenticated `position_change` stream

**Copy-Trade Widget**
On `/wallet/[address]`, "Copy trade" button per position.
Opens modal: size/leverage params → wagmi signs → sends to Nado Gateway.

**Other**
- MCP Server — Claude trades on Nado in natural language
- Trader leaderboard (top wallets by PnL)
- Browser alerts (liquidation > $X)
- Trade history CSV export
- "Liquidation hunter" mode

---

*PRD v2.1 — NadoLens*
