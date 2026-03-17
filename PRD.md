# PRD — NadoLens
> Spec technique complète. Version 1.6.

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

## 2. Stack

| Couche | Choix | Version |
|---|---|---|
| Framework | Next.js App Router | 15 |
| Langage | TypeScript strict | latest |
| UI | Tailwind CSS + shadcn/ui | v4 |
| State | Zustand | 5.x |
| Charts | TradingView Lightweight Charts | v5 |
| Auth | wagmi + viem | 3.x |
| SDK Nado | `@nadohq/client` + `@nadohq/indexer-client` | latest |
| DB | Neon (PostgreSQL) + Prisma | 5.x |
| Package manager app | **pnpm** | latest |
| Package manager WS proxy | **Bun** | latest |
| Deploy app | Vercel | — |
| Deploy WS proxy | Railway | — |

---

## 3. Architecture

```
Browser (React)
  ├── /heatmap        → Liquidation Heatmap (3 couches)
  ├── /dashboard      → Cockpit de Survie (wallet connecté)
  ├── /orderbook      → Orderbook Depth Visualizer
  └── /wallet/[addr]  → Wallet Explorer (n'importe quelle adresse)
        │
        │ SSE + fetch
        ▼
Next.js Backend (Vercel) — pnpm
  ├── /api/liquidations     →  Neon DB
  ├── /api/oi-heatmap       →  calcul OI estimé
  ├── /api/wallet/[address] →  proxy queries Nado Gateway (évite CORS)
  └── Server Actions        →  Nado Archive REST

WS Proxy (Railway) — Bun
  ├── GET /health     →  monitoring + debugging
  ├── GET /sse        →  SSE → browser (EventSource)
  └── WS persistant   →  wss://gateway.prod.nado.xyz/v1/subscribe
        streams : liquidation · book_depth · best_bid_offer
        streams auth : position_change · fill · order_update
```

**Signing EIP-712 côté client uniquement via wagmi/viem.**
Clé privée ne quitte jamais le wallet. Ordres envoyés directement vers Nado Gateway.

---

## 4. Nado API

### WebSocket Subscriptions
`wss://gateway.prod.nado.xyz/v1/subscribe` — testnet : `wss://gateway.test.nado.xyz/v1/subscribe`
- ping 30s obligatoire
- header **obligatoire** : `Sec-WebSocket-Extensions: permessage-deflate` (refus 403 sinon)
- champ `id` obligatoire dans chaque message subscribe (corrélation requête/réponse)
- utiliser le package `ws` côté serveur (pas le WebSocket natif Bun — ne permet pas d'injecter ce header)
Doc : https://docs.nado.xyz/developer-resources/api/subscriptions/streams

| Stream | Auth | Usage |
|---|---|---|
| `liquidation` (`product_id: null`) | Non | Heatmap toutes paires |
| `book_depth` | Non | Orderbook + zones risque |
| `best_bid_offer` | Non | Spread live |
| `latest_candlestick` | Non | Chart de fond |
| `position_change` | Oui | Cockpit + Wallet Explorer live |
| `order_update` | Oui | Suivi ordres |
| `fill` | Oui | Historique exécutions |

**Format subscribe :**
```json
{ "id": 1, "method": "subscribe", "stream": { "type": "liquidation", "product_id": null } }
```
Réponse ACK : `{ "result": null, "id": 1 }` — erreur : `{ "result": null, "error": "...", "id": 1 }`

**Event liquidation :**
```typescript
{
  type: "liquidation"
  timestamp: string     // nanoseconds
  product_ids: number[]
  liquidator: string    // bytes32
  liquidatee: string    // bytes32
  amount: string        // x18 — positif=long liquidé, négatif=short liquidé
  price: string         // x18 — prix oracle
}
```

**Event best_bid_offer :**
```typescript
{
  type: "best_bid_offer"
  timestamp: string   // nanoseconds
  product_id: number
  bid_price: string   // x18
  bid_qty: string     // x18
  ask_price: string   // x18
  ask_qty: string     // x18
}
```

**Event book_depth (diffs — ~100ms) :**
```typescript
{
  type: "book_depth"
  product_id: number
  last_max_timestamp: string  // timestamp du dernier diff reçu — pour ordonner
  min_timestamp: string
  max_timestamp: string
  bids: [string, string][]    // [price_x18, size_x18] — size "0" = niveau supprimé
  asks: [string, string][]
}
```

### REST — Endpoints vérifiés
- Gateway v1 (queries/executes) : `https://gateway.prod.nado.xyz/v1`
- Gateway v2 (market data) : `https://gateway.prod.nado.xyz/v2`
- Archive/Indexer : `https://archive.prod.nado.xyz/indexer`
- Testnet gateway : `https://gateway.test.nado.xyz/v1`
- Testnet archive : `https://archive.test.nado.xyz/v1`
- Doc V2 : https://docs.nado.xyz/developer-resources/api/v2

| Endpoint | Usage |
|---|---|
| `GET /v2/pairs` | Paires disponibles |
| `GET /v2/orderbook?pair=BTCUSDT0` | Snapshot orderbook |
| `GET /v2/tickers` | Stats 24h |
| `GET /v2/trades?pair=BTCUSDT0` | Trades récents |
| `GET /v2/assets` | Assets |

### Gateway queries — `POST /query`
Doc : https://docs.nado.xyz/developer-resources/api/gateway/queries

| Query | Usage |
|---|---|
| `subaccount_info` | Health, marge, positions, maint_weight — Cockpit + Wallet Explorer |
| `all_products` | IDs produits valides |
| `market_liquidity` | Liquidité par produit |

### Archive indexer
Doc : https://docs.nado.xyz/developer-resources/api/archive-indexer

| Query | Usage |
|---|---|
| `orders` | Historique ordres d'un subaccount |
| `matches` | Historique fills — `realized_pnl` (x18) disponible depuis déc. 2025 |
| `candlesticks` | Données OHLCV |

### Gateway executes — `POST /execute` (signés wagmi)
Doc : https://docs.nado.xyz/developer-resources/api/gateway/executes

| Action | Usage |
|---|---|
| `place_order` | Placer un ordre |
| `cancel_orders` | Annuler ordre(s) |
| `cancel_product_orders` | Annuler tous les ordres d'un produit |

---

## 5. Features MVP

---

### Feature 1 — Liquidation Heatmap (3 couches)

Trois vues superposables sur le même graphique TradingView.

**Couche 1 — Passé** (stream `liquidation`)
- Bulles au prix oracle — Vert = long liquidé, Rouge = short liquidé
- Taille = `Math.sqrt(Math.abs(amount / 1e18))` normalisé
- Persistance Neon + replay historique

**Couche 2 — Présent** (stream `book_depth`)
- Zones rouges translucides sur les niveaux où le carnet est léger (~50ms)
- Plus foncé = liquidité plus fine = cascade plus probable

**Couche 3 — Futur estimé** (archive + calcul OI)
```
1. Fetch /v2/trades → distribution prix d'entrée par buckets de $100
2. Pour chaque bucket :
   liq_price_long  = entry_price × (1 - 1/leverage + maint_margin_rate)
   liq_price_short = entry_price × (1 + 1/leverage - maint_margin_rate)
3. Agréger → "à ce prix, X$ de positions risquent la liquidation"
4. Heatmap : bleu froid (peu) → rouge chaud (beaucoup)
```

**Composants :**
```
components/heatmap/
  LiquidationChart.tsx · LayerControls.tsx
  LiquidationFeed.tsx  · LiquidationStats.tsx
store/ : liquidationStore.ts · oiStore.ts
hooks/ : useLiquidationStream.ts · useOIHeatmap.ts
```

**Schema DB :**
```sql
CREATE TABLE liquidations (
  id SERIAL PRIMARY KEY, timestamp BIGINT NOT NULL,
  product_id INTEGER NOT NULL, amount NUMERIC(30,18) NOT NULL,
  price NUMERIC(30,18) NOT NULL, liquidator TEXT NOT NULL,
  liquidatee TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE oi_snapshots (
  id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL,
  price_low NUMERIC(20,2) NOT NULL, price_high NUMERIC(20,2) NOT NULL,
  long_oi_usd NUMERIC(20,2) NOT NULL, short_oi_usd NUMERIC(20,2) NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_liq_product_ts ON liquidations(product_id, timestamp DESC);
CREATE INDEX idx_oi_product_price ON oi_snapshots(product_id, price_low);
```

---

### Feature 2 — Cockpit de Survie (Unified Margin Dashboard)

**3 zones de risque :**

| Zone | Seuil `maintMarginUsage` | UI |
|---|---|---|
| Safe | 0–33% | Normal |
| Warning | 33–66% | Bordure orange, badge pulsant |
| Danger | >66% | `MarginShield` actif, fond pulse rouge |

**Composants et calculs :**

`HealthBar` — progress bar segmentée (remplace "3.12%")

`LiquidationGap` — remplace "Funds Until Liquidation: $39,164.83"
```typescript
const dropToLiquidation = ((markPrice - liquidationPrice) / markPrice) * 100
// Label : "BTC peut chuter de X% avant liquidation"
```

`PredictiveSafety` — l'info manquante lors de la grosse perte
```typescript
const dropTolerance = (availableMargin / totalNotional) * 100
// "Si BTC chute de X%, votre compte est liquidé" — rouge si < 10%
```

`MaintWeightBadge` — < 0.80 gris | 0.80–0.95 orange | ≥ 0.95 rouge + pulse

`PnLFlash` — PnL chute > 5% en < 30s → font × 1.4 + rouge

`MarginShield` — wrapper global, fond pulse rouge en zone Danger

**Composants :**
```
components/dashboard/
  MarginShield.tsx · HealthBar.tsx · LiquidationGap.tsx
  PredictiveSafety.tsx · MaintWeightBadge.tsx · PnLFlash.tsx
  CollateralBreakdown.tsx · PositionsTable.tsx · OpenOrdersList.tsx
store/ : accountStore.ts
hooks/ : useSurvivalMetrics.ts · useAccount.ts
```

---

### Feature 3 — Orderbook Depth Visualizer

- Snapshot `/v2/orderbook` + stream `book_depth` (~50ms)
- Depth chart aire : bids vert, asks rouge, mid-price au centre
- Tableau 20 meilleurs niveaux + spread live
- Sélecteur paire + agrégation 0.1 / 1 / 10 / 100 USDT

```
components/orderbook/ : DepthChart.tsx · OrderbookTable.tsx · SpreadBadge.tsx
store/ : orderbookStore.ts | lib/ : orderbook.ts
```

---

### Feature 4 — Wallet Explorer

**Route :** `/wallet/[address]`

Analyse n'importe quelle adresse Nado — wallet connecté ou wallet quelconque.
Inspiré de NadoDash (nadodash.ink) mais intégré nativement dans NadoLens.

**Données affichées :**

| Section | Source API | Données |
|---|---|---|
| En-tête | `subaccount_info` | Health score, equity totale, marge dispo |
| Positions ouvertes | `subaccount_info` | Paire, côté, taille, entry price, PnL unrealized, liq price |
| Historique trades | archive `matches` | Prix, quantité, PnL réalisé, fees, timestamp |
| Courbe d'equity | archive `matches` cumulés | Graphique TradingView equity dans le temps |
| Stats globales | archive `matches` | Win rate, PnL total réalisé, volume total, avg trade size |

**Comportement :**
- URL : `/wallet/0xc5a7...` — adresse en paramètre dynamique
- Barre de recherche en haut pour entrer n'importe quelle adresse
- Si wallet connecté → lien "Mon portefeuille" dans le header
- Refresh automatique toutes les 30s pour les positions ouvertes
- Données publiques — aucune auth requise pour consulter n'importe quel wallet

```typescript
// Stats calculées côté client
const winRate = (trades.filter(t => t.realized_pnl > 0).length / trades.length) * 100
const totalPnl = trades.reduce((sum, t) => sum + fromX18(t.realized_pnl), 0)
const avgTradeSize = trades.reduce((sum, t) => sum + fromX18(t.amount), 0) / trades.length
```

**Composants :**
```
components/wallet/
  WalletHeader.tsx       ← adresse, health, equity
  WalletPositions.tsx    ← positions ouvertes + PnL live
  WalletTradeHistory.tsx ← historique avec PnL réalisé
  WalletEquityCurve.tsx  ← graphique TradingView equity
  WalletStats.tsx        ← win rate, PnL total, volume, avg size
  WalletSearch.tsx       ← input recherche adresse
hooks/ : useWalletData.ts · useWalletStream.ts
```

---

## 6. Structure projet

```
nadolens/
├── About.md · PRD.md · CLAUDE.md
├── .mcp.json                         ← Context7 projet
├── package.json                      ← pnpm workspace root
├── pnpm-workspace.yaml
├── app/
│   ├── layout.tsx · page.tsx
│   ├── heatmap/page.tsx
│   ├── dashboard/page.tsx
│   ├── orderbook/page.tsx
│   ├── wallet/
│   │   ├── page.tsx                  ← recherche wallet
│   │   └── [address]/page.tsx
│   └── api/
│       ├── liquidations/route.ts
│       ├── oi-heatmap/route.ts
│       └── wallet/[address]/route.ts
├── components/
│   ├── heatmap/ · dashboard/ · orderbook/ · wallet/ · ui/
├── store/
│   ├── liquidationStore.ts · orderbookStore.ts
│   ├── oiStore.ts · accountStore.ts
├── hooks/
│   ├── useLiquidationStream.ts · useOrderbookStream.ts
│   ├── useOIHeatmap.ts · useAccount.ts
│   ├── useSurvivalMetrics.ts · useWalletData.ts · useWalletStream.ts
├── lib/
│   ├── nado.ts · db.ts · signing.ts · orderbook.ts · formatters.ts
├── types/nado.ts
├── prisma/schema.prisma
└── ws-proxy/                         ← Bun, package séparé
    ├── index.ts
    ├── health.ts
    ├── package.json
    └── bun.lockb
```

---

## 7. Types TypeScript

```typescript
// types/nado.ts
export type RiskLevel = "safe" | "warning" | "danger"
export const fromX18 = (val: string): number => parseFloat(val) / 1e18

export interface LiquidationEvent {
  type: "liquidation"; timestamp: string; product_ids: number[]
  liquidator: string; liquidatee: string
  amount: string; price: string  // x18
  amountUsd?: number; priceUsd?: number
  side?: "long" | "short"; pair?: string
}
export interface OrderbookLevel { price: number; size: number; total?: number }
export interface OrderbookState { bids: OrderbookLevel[]; asks: OrderbookLevel[]; lastUpdateMs: number }
export interface Position {
  product_id: number; pair: string; amount: number
  entry_price: number; mark_price: number; unrealized_pnl: number
  liquidation_price: number; margin_used: number
  maint_weight: number; isolated: boolean
}
export interface AccountHealth {
  health_score: number; total_collateral_usd: number
  maintenance_margin: number; maint_margin_usage: number
  available_margin: number; total_notional: number
  risk_level: RiskLevel; drop_tolerance: number
}
export interface OIBucket {
  price_low: number; price_high: number
  long_oi_usd: number; short_oi_usd: number; risk_score: number
}
export interface SurvivalMetrics {
  dropTolerance: number; riskLevel: RiskLevel
  isMaintWeightCritical: boolean; isCritical: boolean
}
export interface TradeMatch {
  timestamp: string; product_id: number; pair: string
  amount: string; price: string        // x18
  realized_pnl: string; closed_amount: string  // x18
  fee: string; side: "long" | "short"
}
export interface WalletStats {
  address: string
  health_score: number; total_equity_usd: number; available_margin: number
  positions: Position[]; trades: TradeMatch[]
  win_rate: number; total_pnl_usd: number
  total_volume_usd: number; avg_trade_size_usd: number
}
```

---

## 8. Variables d'environnement

```bash
# .env — jamais commité (voir .env.example pour le template)
DATABASE_URL=postgresql://...
NADO_GATEWAY_REST=https://gateway.prod.nado.xyz/v1
NADO_ARCHIVE_REST=https://archive.prod.nado.xyz/indexer
NADO_GATEWAY_V2=https://gateway.prod.nado.xyz/v2

# WS Proxy Railway (server-side uniquement)
WS_PROXY_URL=https://nadolens-production.up.railway.app

# WS Proxy accessible côté browser (préfixe NEXT_PUBLIC_ obligatoire)
NEXT_PUBLIC_WS_PROXY_URL=https://nadolens-production.up.railway.app
```

> `WS_PROXY_URL` → API routes Next.js (server-side, pas exposé au browser)
> `NEXT_PUBLIC_WS_PROXY_URL` → hooks client (EventSource, useLiquidationStream)

---

## 9. Phases de développement

### Phase 1 — Foundation ✅ DONE
- [x] Init Next.js 15 + TS strict + Tailwind v4 — **pnpm**
- [x] wagmi v3 + viem (Ink L2 chainId 57073)
- [x] Neon + Prisma 5 + schema (liquidations + oi_snapshots)
- [x] Singleton `@nadohq/client` (`createNadoClient('inkMainnet', { publicClient })`)
- [x] Layout + navigation 4 pages (heatmap, dashboard, orderbook, wallet)
- [x] Zustand stores (liquidation, orderbook, oi, account)
- [x] WS Proxy Bun + package `ws` + endpoint `/health` — `ws_connected: true` confirmé

### Phase 2 — Heatmap ✅ DONE
- [x] `useLiquidationStream` SSE (Railway proxy)
- [x] Couche 1 — tableau live liquidations (dark, rouge/vert par side)
- [x] Couche 2 — OI estimation : `useOIHeatmap`, `HeatmapChart` (canvas), `LayerControls`, persistance Neon
- [x] `/api/liquidations` GET fallback archive Nado (`events + liquidate_subaccount`) si DB vide
- [x] `lightweight-charts` 5.1.0 installé
- [ ] Couche 3 — zones book_depth translucides (optionnel, post-MVP)

### Phase 3 — Cockpit de Survie ✅ DONE
- [x] `useAccount` — wagmi + polling `subaccount_info` 10s, address→bytes32 subaccount
- [x] `useSurvivalMetrics` — dropTolerance, riskLevel, isCritical
- [x] `MarginShield` — wrapper pulsant rouge/orange selon risk level
- [x] `HealthBar` — barre segmentée 3 zones
- [x] `LiquidationGap` — % baisse avant liquidation, position la plus critique
- [x] `PredictiveSafety` — drop tolerance, pulse rouge si < 10%
- [x] `MaintWeightBadge` — gris/orange/rouge selon seuils
- [x] `PnLFlash` — flash rouge si PnL chute > 5% en < 30s
- [x] `PositionsTable` — positions live avec liq price highlight
- [x] `CollateralBreakdown` — collateral / margin / available / notional
- [x] `/api/wallet/[address]` — force-dynamic, no-store

### Phase 4 — Wallet Explorer (suivant)
- [ ] Route `/wallet/[address]` + barre de recherche
- [ ] `useWalletData` → `subaccount_info` + archive `matches`
- [ ] Composants : WalletHeader, WalletPositions, WalletTradeHistory, WalletEquityCurve, WalletStats
- [ ] Courbe equity TradingView Lightweight Charts

### Phase 5 — Orderbook Depth
- [ ] Snapshot `/v2/orderbook` + stream `book_depth` + reconstruction diffs
- [ ] Depth chart (bids/asks) + tableau 20 niveaux + spread live

### Phase 6 — Deploy & Polish
- [ ] README + screenshots + GIF démo
- [ ] Tests testnet + validation prod
- [ ] Push GitHub public + mail Frank

---

## 10. Roadmap post-MVP

> Features à implémenter après le lancement et le retour de Frank.
> Ne pas inclure dans les sprints MVP.

**Copy-Trade Widget**
Sur la page `/wallet/[address]`, bouton "Copy trade" sur chaque position ouverte.
Ouvre un mini-widget modal avec :
- Affichage du trade à copier (paire, côté, taille originale)
- Paramètres : taille en USDT, levier, ratio du wallet à copier
- Calcul en temps réel : liquidation estimée, risque sur le compte
- Bouton "Copier le trade" → wagmi signe → envoi direct Nado Gateway
Toute l'infrastructure est déjà en place (wagmi signing, Nado execute).

**Autres features roadmap**
- MCP Server — Claude trade sur Nado en langage naturel (première sur un DEX)
- Leaderboard traders (top wallets par PnL sur Nado)
- Alertes browser (liquidation > $X sur la heatmap)
- Mode "liquidation hunter" — opportunités de devenir liquidateur
- Export CSV historique de trades
- Migration WS proxy Railway → Fly.io ou Hetzner si volume augmente

---

*PRD v1.8 — NadoLens*
