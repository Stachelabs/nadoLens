# ARCHI.md — NadoLens Wallet Explorer Architecture
> Architecture technique pour la Feature Wallet Explorer — `/wallet/[address]`

---

## 1. Data Flow

```
Browser → /wallet/0xabc...
  │
  │ useWalletData(address) — hook client
  │
  ├── 0. pairsStore.init() — via PairsInitializer (au démarrage de l'app)
  │         fetch /api/pairs → GET gateway.prod.nado.xyz/v2/assets
  │         → Map<product_id, symbol> + perp[] + spot[] (persisté localStorage, TTL 1h)
  │
  ├── 1. fetch /api/subaccounts/{address}
  │         Next.js API Route → POST archive.prod.nado.xyz/v1
  │         body: { subaccounts: { address } }
  │         → [{ subaccount: bytes32, isolated: bool }]
  │         Fallback si échec : subaccount "default" calculé localement
  │
  ├── 2. Promise.all → pour chaque subaccount :
  │         fetch /api/wallet/{subaccount}?query=subaccount_info
  │         Next.js API Route → POST gateway.prod.nado.xyz/v1/query
  │         → health, balances, positions, oracle prices
  │         Merge : toutes positions + sum equity + health du subaccount primary
  │
  └── 3. fetch archive.prod.nado.xyz/v1
            POST { matches: { subaccounts: [all_bytes32], limit: 500, isolated: null } }
            → historique trades avec realized_pnl, fees, sequencer_fee

Résultats → WalletStats parsé dans useWalletData
         → composants wallet (WalletHeader, WalletStats, WalletPositions, etc.)

Refresh stratégie :
  - Positions : polling 30s via setInterval (toutes subaccounts via subaccountsRef)
  - Trade history : fetch initial uniquement
  - Assets (pairsStore) : TTL 1h, localStorage comme fallback entre sessions
```

---

## 2. Subaccount Resolution

Un wallet Ethereum (20 bytes) est converti en subaccount bytes32 :

```typescript
function toSubaccount(address: string): string {
  const addr = address.toLowerCase().replace('0x', '')
  if (addr.length === 64) return `0x${addr}` // déjà bytes32
  return `0x${addr}64656661756c740000000000`  // "default" encodé
}
// Exemple : 0xc5a7... → 0xc5a7...64656661756c740000000000
```

La résolution réelle via `/api/subaccounts/[address]` découvre **tous** les subaccounts (default + isolated margin). Sans cet appel, les positions isolated ne seraient pas visibles.

---

## 3. API Routes

### `/api/subaccounts/[address]/route.ts`
Résolution des subaccounts via Archive. Requiert une adresse EVM valide (20 bytes).

```
GET /api/subaccounts/{address}
  → POST https://archive.prod.nado.xyz/v1
     body: { subaccounts: { address } }
  → { subaccounts: [{ subaccount: bytes32, isolated: bool }] }

Validation : isAddress(address) from viem → cast Address
Fallback retourné si échec : [{ subaccount: toSubaccount(address), isolated: false }]
```

### `/api/wallet/[address]/route.ts`
Proxy positions/health. Accepte adresse EVM (20 bytes) **ou** bytes32 (64 hex chars).

```
GET /api/wallet/{subaccount}?query=subaccount_info
  → POST https://gateway.prod.nado.xyz/v1/query
     body: { type: query, subaccount: address }

Validation : isAddress(address) || /^0x[a-fA-F0-9]{64}$/.test(address)
```

### `/api/pairs/route.ts`
Liste de tous les assets Nado avec market_type. Utilisé par pairsStore au démarrage.

```
GET /api/pairs
  → GET https://gateway.prod.nado.xyz/v2/assets
  → V2Asset[] validé par V2AssetsResponseSchema

Validation Zod : V2AssetsResponseSchema
Cache ISR : revalidate: 3600 (1h)
Fallback statique : 5 spots (USDT0, KBTC, WETH, USDC, NLP) + 3 perps (BTC, ETH, SOL)
```

### `/api/matches/route.ts`
Proxy Archive pour `matches` avec validation Zod du body et de la réponse.

```
POST /api/matches
  body: { subaccounts: string[], limit?: number, idx?: string, isolated?: boolean|null }
  → POST https://archive.prod.nado.xyz/v1
     body: { matches: { subaccounts, limit, idx?, isolated } }
  → { matches: [...], txs: [...] }
```

### `/api/funding/route.ts`
Proxy Archive pour `interest_and_funding` avec validation Zod du body et de la réponse.

```
POST /api/funding
  body: { subaccount: string, product_ids: number[], limit?: number, max_idx?: string }
  → POST https://archive.prod.nado.xyz/v1
     body: { interest_and_funding: { subaccount, product_ids, limit, max_idx? } }
  → { funding_payments: [...], interest_payments: [...], next_idx }
```

---

## 4. pairsStore — Assets dynamiques

`store/pairsStore.ts` — Zustand store avec `persist` middleware (localStorage `nado-assets`).

```typescript
type PairsState = {
  assets: V2Asset[]           // persisté — ~60 assets (perp + spot)
  byId: Map<number, string>   // non persisté — product_id → symbol
  perp: V2Asset[]             // non persisté — market_type === 'perp'
  spot: V2Asset[]             // non persisté — market_type === 'spot' | null
  lastFetched: number | null  // persisté — timestamp ms (TTL 1h)
  initialized: boolean
  init: () => Promise<void>
}
```

**Comportements :**
| Scénario | Résultat |
|---|---|
| Premier chargement, localStorage vide | fetch /api/pairs, stocke localStorage |
| Rechargement, localStorage frais (<1h) | rebuild Map depuis localStorage, skip fetch |
| Rechargement, localStorage périmé (>1h) | rebuild depuis localStorage, puis re-fetch |
| Erreur réseau | localStorage comme fallback réel |

`productName(id)` dans `useWalletData.ts` accède via `usePairsStore.getState().byId` (hors React, synchrone).

---

## 5. Composants React — état actuel

```
app/wallet/page.tsx                  ← Page recherche (Client) — isAddress + router.push
app/wallet/[address]/page.tsx        ← Page wallet (Client) — use(params) + useWalletData

components/wallet/
  WalletHeader.tsx     Props: { stats: WalletStats }      ← adresse, health, equity, marge
  WalletStats.tsx      Props: { stats: WalletStats }      ← win rate, PnL, volume, avg size
  WalletPositions.tsx  Props: { positions: Position[] }   ← positions ouvertes + PnL unrealized
  WalletTradeHistory.tsx Props: { trades: TradeMatch[] }  ← historique 50 derniers trades
  WalletEquityCurve.tsx  Props: { trades: TradeMatch[] }  ← TradingView equity curve

hooks/
  useWalletData.ts     ← multi-subaccount fetch + polling 30s → WalletData
  usePairs.ts          ← déclenche pairsStore.init() au mount (via PairsInitializer)
  useAccount.ts        ← wrapper wagmi useAccount (wallet connecté)

store/
  pairsStore.ts        ← Zustand + persist — assets V2, byId Map, perp[], spot[]
  accountStore.ts      ← Zustand — état wallet connecté

lib/schemas/nado.ts    ← NadoSubaccountDataSchema + ArchiveMatchesResponseSchema + V2AssetSchema (Zod)
types/nado.ts          ← WalletStats, Position, TradeMatch, fromX18
app/providers.tsx      ← PairsInitializer (headless) → usePairs() au démarrage app
```

---

## 6. Mapping API → UI

### WalletPositions
| Colonne | Source |
|---|---|
| Paire | `perp_balances[i].product_id` → `productName()` via pairsStore |
| Côté | `perp_balances[i].balance.amount` : positif=LONG, négatif=SHORT |
| Taille | `abs(fromX18(amount))` |
| Entry Price | `oracle_price_x18` (mark price au moment du fetch — pas d'entry stockée) |
| Mark Price | `fromX18(oracle_price_x18)` |
| Unrealized PnL | `fromX18(v_quote_balance) + amount × markPrice` |
| Liq Price | estimé : `markPrice × (1 ± 1/leverage + maintMarginRate)` |

### WalletTradeHistory (archive matches)
| Colonne | Source |
|---|---|
| Time | `submission_idx` → estimation `Date.now() - diff × 2s` (Ink L2 ≈ 2s/bloc) |
| Prix | `fromX18(order.priceX18)` |
| Quantité | `abs(fromX18(base_filled))` |
| PnL réalisé | `fromX18(realized_pnl)` |
| Fees | `fromX18(fee)` |

### WalletStats (calculé dans useWalletData)
```typescript
// Seules les fermetures de position ont un PnL réalisé (closed_amount !== "0")
const closingTrades = trades.filter(t => t.closed_amount !== "0")

winRate = closingTrades.length > 0
  ? (closingTrades.filter(t => BigInt(t.realized_pnl) > 0n).length / closingTrades.length) * 100
  : 0

totalPnl = sum(fromX18BigInt(t.realized_pnl) for t in closingTrades)
totalFees = sum(fromX18BigInt(t.fee))   // fee = taker/maker + sequencer (total) — sequencer_fee = breakdown, ne pas sommer
totalVolume = sum(abs(fromX18BigInt(t.quote_filled ?? "0")))
avgTradeSize = totalVolume / trades.length
```

---

## 7. Pagination des matches

L'archive retourne max 500 matches par requête. Implémentation actuelle : limit=200, pas de pagination (MVP). Pour paginer :

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

| Donnée | Méthode | Intervalle |
|---|---|---|
| Positions / Health | Polling `/api/wallet/[subaccount]` | 30s |
| Trade history | Fetch initial uniquement | — |
| Equity curve | Recalculée quand `trades` change | Sur mount |
| Assets (pairsStore) | Fetch + localStorage persist | TTL 1h |

> Positions temps réel nécessiterait `position_change` stream authentifié (clé privée du wallet) — impossible pour un wallet tiers. Le polling 30s est la seule option pour observer un wallet quelconque.

Pourquoi 30s ?
- C'est un compromis charge/précision: vue "quasi live" sans spam API.
- Le `subaccount_info` coûte du weight, donc 30s reste confortable même avec plusieurs subaccounts.
- On ne peut pas s'abonner en WS auth sur un wallet tiers côté browser sans sa signature.

---

## 9. Rate Limits Wallet Explorer

| Appel | Weight | Fréquence |
|---|---|---|
| `subaccounts` (Archive) | 2 | 1× au load |
| `subaccount_info` (Gateway) | 2 × nb_subaccounts | 30s |
| `matches` (Archive, limit=200, 1 sub) | 2 + 200/10 = 22 | 1× au load |
| Assets `/v2/assets` | — | 1× par heure max (TTL localStorage) |

Total par refresh positions (2 subaccounts) : ~4 weight → safe avec 2400/min max.

---

## 10. Points Nado

Non disponible via API publique. Ignorer pour MVP → afficher "—" ou masquer.

---

*ARCHI.md v3.0 — NadoLens Wallet Explorer — mis à jour 2026-03-27*

---

## README Architecture Block (copiable)

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

## 11. Conventions API routes Next.js (Zod)

Toutes les routes proxy Nado sous `app/api/**/` suivent le même pattern:

1. **Body entrant** (POST) : `SomeRequestSchema.safeParse(await request.json())` → `400` si invalide.
2. **Appel** : `fetch(NADO_GATEWAY_REST | NADO_ARCHIVE_REST, { headers: { Accept-Encoding: gzip, br, deflate } })`.
3. **Réponse** : `parseArchiveJson(ResponseSchema, raw)` (`lib/api/validateResponse.ts`) → `502` si shape invalide.
4. **Réponse client** : JSON déjà validé (types = `z.infer<>`).

Helper partagé : `lib/api/validateResponse.ts` — `parseArchiveJson(schema, raw)`.

---

## 12. Timestamps nanosecondes & stats “all-time”

Les champs `timestamp` des trades sont des **nanosecondes** en string décimal (~1e18). **`parseInt` / `Number` dépassent `MAX_SAFE_INTEGER`** → dates fausses ou “futur”.

- Conversion sûre : `lib/wallet/nanoTime.ts` → `nanoStringToMs` / `nanoStringToUnixSec` (BigInt).
- **Premier / dernier trade** : dérivés des trades min/max `submission_idx`, pas des bords de tableau (après tri `sortTradesNewestFirst`).

Tant que `trades_complete === false` (pagination matches en cours), les **volumes / fees / PnL agrégés / first-last trade** ne sont **pas** affichés (UI `—`) pour éviter les montants partiels qui changeaient à chaque page.

---

## Checklist Validation (10 lignes)

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
