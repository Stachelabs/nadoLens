# CLAUDE.md — NadoLens
> Règles de travail. Lire en entier avant de toucher au code.
> Contexte projet → About.md | Spec complète → PRD.md

---

## Documentation Nado — consulter avant de coder

| Section | URL |
|---|---|
| API overview | https://docs.nado.xyz/developer-resources/api |
| Gateway queries | https://docs.nado.xyz/developer-resources/api/gateway/queries |
| Gateway executes | https://docs.nado.xyz/developer-resources/api/gateway/executes |
| Signing EIP-712 | https://docs.nado.xyz/developer-resources/api/gateway/signing |
| WS Streams | https://docs.nado.xyz/developer-resources/api/subscriptions/streams |
| WS Events | https://docs.nado.xyz/developer-resources/api/subscriptions/events |
| Archive indexer | https://docs.nado.xyz/developer-resources/api/archive-indexer |
| API V2 REST | https://docs.nado.xyz/developer-resources/api/v2 |
| TypeScript SDK | https://docs.nado.xyz/developer-resources/typescript-sdk |
| Liquidations | https://docs.nado.xyz/liquidations |
| Subaccounts | https://docs.nado.xyz/subaccounts-and-health |
| Formules | https://docs.nado.xyz/definitions-formulas |

---

## Context7 — documentation live des librairies

**Toujours utiliser Context7 — jamais se fier à la mémoire pour les librairies.**

```json
// .mcp.json à la racine du projet
{
  "mcpServers": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

IDs Context7 prioritaires :
```
/vercel/next.js                 → Next.js 15 App Router
/wevm/wagmi                     → wagmi v2
/wevm/viem                      → viem
/pmndrs/zustand                 → Zustand 5
/prisma/prisma                  → Prisma 5
/tradingview/lightweight-charts → TradingView Charts v5
```

---

## Package managers

| Package | Manager | Raison |
|---|---|---|
| App Next.js | **pnpm** | Standard Next.js, compat shadcn/prisma/wagmi |
| WS Proxy | **Bun** | Runtime WS natif ultra-rapide, process léger long-running |

```bash
# App Next.js
pnpm install
pnpm dev
pnpm build

# WS Proxy uniquement
cd ws-proxy
bun install
bun run index.ts
```

---

## Stack — versions exactes

```
Next.js                15 (App Router)
TypeScript             strict — zéro any
Tailwind CSS           v4
shadcn/ui              latest
Zustand                5.x
wagmi                  3.x
viem                   2.x
TradingView            Lightweight Charts v5
@nadohq/client         latest
@nadohq/indexer-client latest
Prisma                 5.x
```

---

## Méthode de travail — APEX

```bash
# Commandes recommandées
/apex -i implement <description>          # Interactif — voir le plan avant de coder (recommandé pour démarrer)
/apex -a -s implement <description>       # Auto + save — pour les phases suivantes
/apex -a -s -t implement <description>    # Avec tests
/apex -a -s -x implement <description>    # Avec review adversariale
/apex -a -s -m implement <description>    # Agents parallèles (phases complexes)
/apex -a -s -e implement <description>    # Economy — moins de tokens
```

**Flags :**
- `-i` interactive (valider le plan avant de coder) | `-a` auto | `-s` save outputs
- `-t` tests | `-x` examine (review adversariale) | `-m` teams (agents parallèles)
- `-b` branch git | `-e` economy (moins de tokens)

**Modèle :** Sonnet 4.6 par défaut. Basculer sur Opus 4.6 (`/model opus`) uniquement
si Sonnet tourne en rond sur un problème d'architecture complexe.

**Starter Phase 1 — copier-coller dans Claude Code :**
```
/apex -i implement nadolens phase 1 foundation

Lis About.md, PRD.md et CLAUDE.md avant de commencer.
Use context7 pour toute doc de librairie.
Consulte les URLs doc Nado dans CLAUDE.md si besoin.
@nadohq/client est public sur npm — pas de token requis.
Ink L2 chainId = 57073.

Phase 1 :
- Init Next.js 15 TypeScript strict + Tailwind v4 + shadcn — pnpm
- wagmi v2 + viem (Ink L2 chainId 57073)
- Neon + Prisma + migrations (liquidations + oi_snapshots)
- Singleton @nadohq/client + @nadohq/indexer-client
- Layout + navigation 4 pages (heatmap, dashboard, orderbook, wallet)
- Zustand stores (liquidationStore, orderbookStore, oiStore, accountStore)
- WS Proxy Bun dans ws-proxy/ — endpoint /health (monitoring)
```

---

## Règles TypeScript

- Zéro `any` — toujours typer explicitement
- Zéro `as unknown as X` — si besoin, le type est mal conçu
- Tous les payloads Nado typés dans `types/nado.ts`
- `fromX18(val: string): number` pour toutes les conversions Nado
- Imports depuis `types/nado.ts` uniquement — jamais de re-déclarations locales

---

## Règles architecture

**Côté client (browser)**
- Rendu React + Zustand stores
- Signing EIP-712 via wagmi/viem — jamais côté serveur
- Connexion SSE via `EventSource` vers WS Proxy Railway
- Ordres signés envoyés directement vers Nado Gateway

**Côté serveur Next.js (Vercel)**
- `/api/liquidations` — lecture/écriture Neon
- `/api/oi-heatmap` — calcul OI estimé
- `/api/wallet/[address]` — proxy queries Nado Gateway (évite CORS browser)
- Server Actions — fetch Nado Archive REST

**WS Proxy (Railway — Bun)**
- Région : **eu-west4** (Pays-Bas) — OBLIGATOIRE. Les IPs US East (Google Cloud) sont bloquées
  par Nado pour les connexions WebSocket (`{"reason":"ip_query_only","blocked":true}`).
- WS persistant vers `wss://gateway.prod.nado.xyz/v1/subscribe`
  (testnet : `wss://gateway.test.nado.xyz/v1/subscribe`)
- SSE vers clients browser
- `GET /health` — monitoring et debugging uniquement
  → Railway ne dort PAS sur un process actif (contrairement à Render free tier)
  → Pas besoin de ping anti-sleep, mais /health reste utile pour surveiller l'état
    du process depuis le dashboard Railway et diagnostiquer les incidents
- URL prod : `https://nadolens-production.up.railway.app`

**Build Vercel :**
- Script build : `"build": "prisma generate && next build"` (prisma generate avant next build)
- Wagmi optional peer deps exclus via `webpack resolve.alias = false` dans `next.config.ts`
  (`@safe-global/safe-apps-provider`, `@safe-global/safe-apps-sdk`, `@walletconnect/ethereum-provider`, `@walletconnect/modal`)

**Jamais :**
- ❌ Clé privée dans le code Next.js ou dans le browser
- ❌ Signing d'ordres côté serveur Next.js
- ❌ `console.log` de payloads avec adresses wallet ou signatures
- ❌ Committer `.env`, `.env.local`, ou tout fichier avec secrets, egalement pas de commit About.md

---

## Règles composants

- Un composant = un fichier = une responsabilité
- `PascalCase.tsx` composants — `camelCase.ts` hooks et libs
- Hooks → `hooks/` préfixés `use`
- Stores → `store/` suffixés `Store`
- Logique métier → `hooks/` ou `lib/` — jamais dans les composants
- shadcn/ui pour tous les éléments UI de base

---

## Pattern Zustand

```typescript
import { create } from 'zustand'
import type { LiquidationEvent } from '@/types/nado'

interface LiquidationStore {
  events: LiquidationEvent[]
  addEvent: (event: LiquidationEvent) => void
  clear: () => void
}

export const useLiquidationStore = create<LiquidationStore>((set) => ({
  events: [],
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 500)
    })),
  clear: () => set({ events: [] }),
}))
```

---

## WS Proxy — Bun (ws-proxy/index.ts)

**Important :** utiliser le package `ws` (pas le WebSocket natif Bun).
Le serveur Nado exige `Sec-WebSocket-Extensions: permessage-deflate` — le WebSocket natif Bun
ne permet pas d'injecter ce header, le package `ws` le permet.
Le message subscribe doit inclure un champ `id` (corrélation) sinon le serveur renvoie une erreur.

```typescript
import { WebSocket } from 'ws'  // ← package ws, pas natif Bun

const connect = (attempt = 0) => {
  const ws = new WebSocket(NADO_WS_URL, {
    headers: { 'Sec-WebSocket-Extensions': 'permessage-deflate' }
  })
  ws.on('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'subscribe', stream: { type: 'liquidation', product_id: null } }))
    const ping = setInterval(() => ws.send(JSON.stringify({ method: 'ping' })), 30_000)
    ws.on('close', () => { clearInterval(ping); reconnect(attempt + 1) })
  })
  ws.on('error', () => reconnect(attempt + 1))
}
const reconnect = (attempt: number) => {
  const delay = Math.min(1000 * 2 ** attempt, 30_000)
  setTimeout(() => connect(attempt), delay)
}
```

---

## SSE — headers obligatoires

```typescript
// WS Proxy response headers
headers: {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
}
// Format event : data: {"type":"liquidation",...}\n\n

// Côté browser — utiliser NEXT_PUBLIC_WS_PROXY_URL (pas WS_PROXY_URL qui est server-only)
const WS_PROXY_URL = process.env.NEXT_PUBLIC_WS_PROXY_URL ?? 'http://localhost:3001'
const source = new EventSource(`${WS_PROXY_URL}/sse`)
source.onmessage = (e) => {
  const event = JSON.parse(e.data) as LiquidationEvent
  useLiquidationStore.getState().addEvent(event)
}
```

---

## Cockpit de Survie — règles

**Philosophie : le trader ressent le danger, il ne le lit pas.**

```typescript
// useSurvivalMetrics — seule source de vérité pour le risque
const riskLevel: RiskLevel =
  maintMarginUsage > 0.66 ? "danger" :
  maintMarginUsage > 0.33 ? "warning" : "safe"

const dropToLiquidation = ((markPrice - liquidationPrice) / markPrice) * 100
const dropTolerance = (availableMargin / totalNotional) * 100
// isCritical si dropTolerance < 10%

// MaintWeightBadge
// < 0.80 → gris | 0.80–0.95 → orange | ≥ 0.95 → rouge + animate-pulse

// PnLFlash — useRef pour PnL précédent
// delta < -5% en < 30s → font-size × 1.4 + rouge
```

---

## Wallet Explorer — rappels

- `subaccount_info` pour positions + health (live)
- Archive `matches` pour historique — `realized_pnl` (x18) dispo depuis déc. 2025
- Données publiques — pas d'auth pour lire n'importe quel wallet
- Proxy `/api/wallet/[address]` côté Next.js pour éviter CORS browser

---

## Nado API — rappels clés

- Valeurs en **x18** → `fromX18()` systématiquement
- Ping WS toutes les **30s** obligatoire (envoyer `{ method: "ping" }`)
- Header WS **obligatoire** : `Sec-WebSocket-Extensions: permessage-deflate` (403 sinon)
- Champ `id` **obligatoire** dans chaque message subscribe (erreur sinon)
- `book_depth` = diffs : `[price_x18, size_x18]` — size `"0"` = niveau supprimé du carnet
- Subaccount = bytes32 = adresse wallet (20b) + nom (12b) en hex
- `product_id: null` sur stream `liquidation` = toutes les paires
- Mainnet WS : `wss://gateway.prod.nado.xyz/v1/subscribe`
- Testnet WS : `wss://gateway.test.nado.xyz/v1/subscribe`
- Gateway REST v1 : `https://gateway.prod.nado.xyz/v1` (queries + executes)
- Gateway REST v2 : `https://gateway.prod.nado.xyz/v2` (market data — pairs, orderbook…)
- Archive/Indexer : `https://archive.prod.nado.xyz/indexer`
- ⚠️ `gateway.nado.xyz` et `archive.nado.xyz` sont morts (404 Vercel)

---

## Prisma / Neon

- Singleton dans `lib/db.ts`
- `createMany({ skipDuplicates: true })` pour les liquidations
- Index sur `(product_id, timestamp DESC)` pour les queries heatmap

---

## Git

```
feat(heatmap): add OI estimation layer 3
feat(cockpit): add MarginShield wrapper
feat(wallet): add wallet explorer page
fix(ws-proxy): reconnect backoff on stream drop
chore(deps): update @nadohq/client
```

**Workflow branches :**
- Toujours créer une branche `feat/` ou `fix/` — jamais committer directement sur `main`
- Chaque branche crée automatiquement un **Vercel Preview** (URL unique)
- Tester sur le preview avant de merge sur main (deploy production automatique)
- PR → merge → delete branch

```bash
git checkout -b feat/heatmap-layer2
# ... code ...
git push -u origin feat/heatmap-layer2
# Vercel génère une preview URL → tester → merge PR
```

---

## Commandes

```bash
# App Next.js (pnpm)
pnpm dev
pnpm build
npx prisma migrate dev && npx prisma studio

# WS Proxy (Bun)
cd ws-proxy && bun run index.ts

# Check
pnpm tsc --noEmit && pnpm lint
```

---

## Priorités MVP — ordre strict

1. ~~WS Proxy Bun Railway + `/health` (monitoring)~~ ✅
2. ~~`useLiquidationStream` SSE → Zustand~~ ✅
3. ~~Heatmap couche 1 (tableau live)~~ ✅ ~~couche 2 (OI estimation + HeatmapChart canvas)~~ ✅ → couche 3 (book_depth zones)
4. ~~Cockpit de Survie~~ ✅ — useAccount, useSurvivalMetrics, MarginShield, HealthBar, LiquidationGap, PredictiveSafety, MaintWeightBadge, PnLFlash, PositionsTable, CollateralBreakdown
5. Wallet Explorer (`/wallet/[address]`)
6. Orderbook depth

**Notes architecture livrée :**
- Archive Nado : endpoint `events` + `event_types: ["liquidate_subaccount"]` = liquidations historiques
- Subaccount bytes32 = `0x{address}64656661756c740000000000` (default subaccount)
- `/api/liquidations` GET : fallback archive si DB vide
- `/api/wallet/[address]` : force-dynamic, no-store cache (polling 10s)
- `parseSubaccountInfo()` dans `hooks/useAccount.ts` = point d'ajustement si format Nado change

**Ne pas sauter d'étape.**

---

*CLAUDE.md v1.8 — NadoLens*
