# PRD — NadoLens
> Spec technique complète. Version 2.0.

---

## 1. Documentation officielle Nado

> Toujours consulter ces URLs avant de coder — ne pas se fier à la mémoire.

| Section | URL |
|---|---|
| Docs générales | https://docs.nado.xyz |
| API overview | https://docs.nado.xyz/developer-resources/api |
| Gateway endpoints | https://docs.nado.xyz/developer-resources/api/gateway |
| Gateway queries | https://docs.nado.xyz/developer-resources/api/gateway/queries |
| Gateway executes | https://docs.nado.xyz/developer-resources/api/gateway/executes |
| Signing EIP-712 | https://docs.nado.xyz/developer-resources/api/gateway/signing |
| WS Streams | https://docs.nado.xyz/developer-resources/api/subscriptions/streams |
| WS Events | https://docs.nado.xyz/developer-resources/api/subscriptions/events |
| Archive (indexer) | https://docs.nado.xyz/developer-resources/api/archive-indexer |
| Trigger API | https://docs.nado.xyz/developer-resources/api/trigger |
| API V2 REST | https://docs.nado.xyz/developer-resources/api/v2 |
| TypeScript SDK | https://docs.nado.xyz/developer-resources/typescript-sdk |
| Formules / Définitions | https://docs.nado.xyz/definitions-formulas |
| Liquidations | https://docs.nado.xyz/liquidations |
| Margin types | https://docs.nado.xyz/margin-types |
| Subaccounts & Health | https://docs.nado.xyz/subaccounts-and-health |
| API Changelog | https://docs.nado.xyz/developer-resources/api/api-changelog |

---

## 2. Architecture

```
Browser (React)
  └── /wallet/[addr]  → Wallet Explorer (n'importe quelle adresse)
        │
        │ useWalletData hook (fetch + polling 30s)
        ▼
Next.js Backend (Vercel) — pnpm
  ├── /api/pairs              → proxy liste paires Nado
  └── /api/wallet/[address]   → proxy queries Nado Gateway (évite CORS)
  ├── /api/matches            → proxy archive matches (validation Zod)
  └── /api/funding            → proxy archive interest_and_funding (validation Zod)

WS Proxy (Railway) — Bun
  ├── GET /health     →  monitoring
  ├── GET /sse        →  SSE → browser (EventSource)
  └── WS persistant   →  wss://gateway.prod.nado.xyz/v1/subscribe
```

**Signing EIP-712 côté client uniquement via wagmi/viem.**
Clé privée ne quitte jamais le wallet. Ordres envoyés directement vers Nado Gateway.

> Features heatmap, dashboard, orderbook : supprimées du build actuel pour focus MVP Wallet Explorer.
> Spécifications conservées en section 8 (roadmap) pour implémentation future si nécessaire.

---

## 4. Nado API

> **Référence complète → `.claude/docs/`** (voir `CLAUDE.md` § Documentation API Nado pour le tableau de routing)
> Ne pas dupliquer ici.

> **Marge isolée** (deux bytes32 : parent vs « poche », fills `matches` côté parent) : règles → `CLAUDE.md` · data flow → `ARCHI.md` · détail Archive → `.claude/docs/NADO_ARCHIVE_API.md`.

---

## 5. Feature principale — Wallet Explorer

**Route :** `/wallet` (recherche) · `/wallet/[address]` (détail)

Analyse n'importe quelle adresse Nado — wallet connecté ou wallet quelconque.

**Données affichées :**

| Section | Source API | Données |
|---|---|---|
| En-tête | `subaccount_info` | Health score, equity totale, marge dispo |
| Positions ouvertes | `subaccount_info` | Paire, côté, taille, mark price, PnL unrealized, liq price |
| Historique trades | archive `matches` via `/api/matches` | Prix, quantité, PnL réalisé, fees, timestamp |
| Courbe d'equity | archive `matches` cumulés | TradingView Lightweight Charts — PnL cumulé dans le temps |
| Stats globales | `matches` + `interest_and_funding` | Win rate, PnL trading (perp), funding payé, volume perp/spot/total |

**Composants implémentés :**
```
app/wallet/page.tsx                    ← Barre de recherche + redirection mon wallet
app/wallet/[address]/page.tsx          ← Client component — use(params) + useWalletData
components/wallet/
  WalletHeader.tsx                     ← adresse, health, equity, marge
  WalletStats.tsx                      ← win rate, PnL, volume, avg size
  WalletPositions.tsx                  ← positions ouvertes + PnL unrealized
  WalletTradeHistory.tsx               ← 50 derniers trades
  WalletEquityCurve.tsx                ← TradingView equity curve
hooks/useWalletData.ts                 ← fetch + polling + calcul stats
```

**Comportement :**
- URL : `/wallet/0xc5a7...` — adresse en paramètre dynamique
- Validation `isAddress(viem)` avant navigation + `notFound()` si invalide
- Lien "My Wallet" dans Nav quand wallet connecté
- Refresh positions toutes les 30s via setInterval (pour suivre health/equity sans websocket auth)
- Données publiques — aucune auth requise

---

## 6. Structure projet actuelle

```
nadolens/
├── PRD.md · CLAUDE.md · ARCHI.md
├── package.json                      ← pnpm, scripts: prisma generate && next build
├── next.config.ts                    ← turbopack: {} + webpack externals
├── tsconfig.json                     ← ws-proxy/ exclu
├── app/
│   ├── layout.tsx                    ← ThemeProvider (next-themes) + Providers + Nav
│   ├── page.tsx                      ← redirect vers /wallet
│   ├── providers.tsx                 ← WagmiProvider + QueryClient + RainbowKitProvider
│   ├── globals.css                   ← Tailwind v4
│   ├── wallet/
│   │   ├── page.tsx                  ← recherche wallet
│   │   └── [address]/page.tsx        ← détail wallet (client component)
│   └── api/
│       ├── pairs/route.ts                    ← liste paires Nado
│       ├── wallet/[address]/route.ts         ← proxy Gateway (subaccount_info, etc.)
│       ├── subaccounts/[address]/route.ts    ← résolution adresse → bytes32 (Archive)
│       ├── matches/route.ts                  ← proxy Archive matches (validation Zod)
│       └── funding/route.ts                  ← proxy Archive interest_and_funding (validation Zod)
├── components/
│   ├── Nav.tsx                       ← sticky nav, connect button, theme toggle
│   ├── ThemeToggle.tsx               ← next-themes toggle
│   ├── wallet/                       ← 5 composants wallet
│   └── ui/                           ← shadcn components (button, card, badge, input, table, separator)
├── hooks/
│   ├── useWalletData.ts
│   └── useAccount.ts
├── store/
│   └── accountStore.ts
├── lib/
│   ├── wagmi.ts                      ← inkL2 defineChain (id: 57073) + wagmiConfig
│   ├── nado.ts                       ← constantes NADO_GATEWAY / NADO_ARCHIVE
│   ├── db.ts                         ← Prisma client singleton
│   ├── utils.ts                      ← cn()
│   └── schemas/nado.ts               ← Zod schemas (source de vérité types)
├── types/nado.ts                     ← interfaces + fromX18
├── prisma/schema.prisma
├── scripts/test-api-queries.ts
└── ws-proxy/                         ← Bun, package séparé (exclu du tsconfig principal)
    ├── index.ts
    ├── package.json
    └── tsconfig.json
```

---

## 7. Types TypeScript

> Source de vérité : `lib/schemas/nado.ts` (Zod schemas + `z.infer<>`).
> `types/nado.ts` contient `fromX18`, `RiskLevel`, et les interfaces domain (Position, TradeMatch, WalletStats, etc.).

---

## 8. Variables d'environnement

```bash
# .env — jamais commité (voir .env.example pour le template)
DATABASE_URL=postgresql://...
NADO_GATEWAY_REST=https://gateway.prod.nado.xyz/v1
NADO_ARCHIVE_REST=https://archive.prod.nado.xyz/v1

# WS Proxy Railway (server-side uniquement)
WS_PROXY_URL=https://nadolens-production.up.railway.app

# WS Proxy accessible côté browser (préfixe NEXT_PUBLIC_ obligatoire)
NEXT_PUBLIC_WS_PROXY_URL=https://nadolens-production.up.railway.app
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

---

## 9. Phases de développement

### ✅ Phase Foundation
Fresh install Next.js 16 + Turbopack + Tailwind v4 + shadcn/ui + wagmi v2 + RainbowKit v2 + viem v2 + Prisma 5 + Zustand 5 + WS Proxy Bun Railway

### ✅ Phase Wallet Explorer
`useWalletData` · WalletHeader · WalletStats · WalletPositions · WalletTradeHistory · WalletEquityCurve · Nav + recherche + theme toggle

### → Phase Deploy & Polish
- [ ] README + screenshots + GIF démo
- [ ] Tests prod (connexion wallet, recherche adresse, positions live)
- [ ] Push GitHub public + mail Frank

### Phase Orderbook Depth (post-polish)
- [ ] Snapshot `/v2/orderbook` + stream `book_depth` + reconstruction diffs
- [ ] Depth chart (bids/asks) + tableau 20 niveaux + spread live

---

## 10. Roadmap post-MVP

> Features à implémenter après le lancement et le retour de Frank.

**Heatmap Liquidations** (Feature supprimée du build courant)
- Stream `liquidation` → Neon DB → replay historique + bulles TradingView
- Couche OI estimé (archive `/v2/trades` → distribution prix d'entrée)
- Couche `book_depth` — zones de liquidité fine

**Cockpit de Survie** (Feature supprimée du build courant)
- Dashboard wallet connecté : HealthBar, MarginShield, PredictiveSafety, PnLFlash
- Requires `position_change` stream authentifié

**Copy-Trade Widget**
Sur `/wallet/[address]`, bouton "Copy trade" par position.
Ouvre modal : paramètres taille/levier → wagmi signe → envoi Nado Gateway.

**Autres**
- MCP Server — Claude trade sur Nado en langage naturel
- Leaderboard traders (top wallets par PnL)
- Alertes browser (liquidation > $X)
- Export CSV historique de trades
- Mode "liquidation hunter"

---

*PRD v2.0 — NadoLens*
