# ARCHI.md — NadoLens Wallet Explorer Architecture
> Architecture technique pour la Feature 4 — `/wallet/[address]`

---

## 1. Data Flow

```
Browser → /wallet/0xabc...
  │
  │ 1. fetch /api/wallet/0xabc...
  ▼
Next.js API Route: /api/wallet/[address]/route.ts
  │ 2. POST archive/indexer → { "subaccounts": { "address": "0xabc..." } }
  │    → Résout address → subaccount(s) bytes32
  │ 3. POST gateway/v1/query → { "type": "subaccount_info", "subaccount": "0x...b32" }
  │    → Health, balances, positions, oracle prices
  │ 4. POST archive/indexer → { "matches": { "subaccounts": [...], "limit": 500 } }
  │    → Historique trades avec realized_pnl, fees
  │ 5. POST archive/indexer → { "orders": { "subaccounts": [...], "limit": 100 } }
  │    → Ordres ouverts/pending
  ▼
Response JSON consolidée → walletStore (Zustand) → Composants
```

---

## 2. Subaccount Resolution

Un wallet peut avoir plusieurs subaccounts. Toujours résoudre d'abord :
```typescript
// 1. Fetch la liste
POST archive/indexer → { "subaccounts": { "address": "0xc5a752..." } }
// → [{ "subaccount": "0x...default", "subaccount_name": "default" }, ...]

// 2. Construire le bytes32 manuellement si besoin
function addressToSubaccount(address: string, name: string = 'default'): string {
  const addr = address.toLowerCase().replace('0x', '')
  const nameHex = Buffer.from(name).toString('hex').padEnd(24, '0')
  return `0x${addr}${nameHex}`
}
```

---

## 3. API Route — `/api/wallet/[address]/route.ts`

Endpoint unique qui agrège les 4 appels Nado côté serveur (évite CORS, transforme x18, calcule stats).

Response shape :
```typescript
{
  address: string
  subaccounts: { subaccount: string, name: string, isolated: boolean }[]
  activeSubaccount: {
    health: { initial, maintenance, unweighted }  // fromX18
    spotBalances: { product_id, amount }[]
    perpBalances: { product_id, amount, v_quote_balance }[]
    perpProducts: { product_id, oracle_price, risk_weights }[]
  }
  matches: Match[]     // historique trades
  orders: Order[]      // ordres ouverts
  stats: { totalPnl, winRate, totalVolume, totalFees, tradeCount, avgTradeSize }
}
```

---

## 4. Composants React

```
app/wallet/[address]/page.tsx          ← Server Component, fetch initial
components/wallet/
  WalletDashboard.tsx                  ← Client wrapper, gère le state
  WalletHeader.tsx                     ← Adresse tronquée, health bar, equity
  WalletBalances.tsx                   ← Balances spot + perp collateral
  WalletPositions.tsx                  ← Tableau positions ouvertes
  WalletOpenOrders.tsx                 ← Ordres ouverts/pending
  WalletTradeHistory.tsx               ← Historique avec PnL réalisé + fees
  WalletEquityCurve.tsx                ← TradingView Lightweight Charts
  WalletStats.tsx                      ← Cards : win rate, PnL total, volume, fees
  WalletSearch.tsx                     ← Barre recherche adresse (header global)
hooks/
  useWalletData.ts                     ← fetch + polling 30s
store/
  walletStore.ts                       ← Zustand
```

---

## 5. Mapping API → UI

### WalletPositions
| Colonne | Source |
|---|---|
| Paire | `perp_products[i].product_id` → mapping `all_products` |
| Côté | `perp_balances[i].amount` : positif=LONG, négatif=SHORT |
| Taille | `abs(fromX18(amount))` |
| Entry Price | `abs(v_quote_balance / amount)` |
| Mark Price | `perp_products[i].oracle_price_x18` |
| Unrealized PnL | `(mark - entry) × amount` (long) ou inverse (short) |

### WalletTradeHistory (matches)
| Colonne | Source |
|---|---|
| Prix | `fromX18(order.priceX18)` ou `quote_filled / base_filled` |
| Quantité | `fromX18(base_filled)` |
| PnL réalisé | `fromX18(realized_pnl)` |
| Fees | `fromX18(fee)` |

### WalletStats (calculé côté serveur)
```typescript
const winRate = matches.filter(m => fromX18(m.realized_pnl) > 0).length / total * 100
const totalPnl = sum(fromX18(m.realized_pnl))
const totalFees = sum(fromX18(m.fee))
const volume = sum(abs(fromX18(m.quote_filled)))
```

---

## 6. Pagination des matches

L'archive retourne max 500 matches par requête. Pour un trader actif il peut y en avoir des milliers.

```typescript
async function fetchAllMatches(subaccount: string, maxTotal: number = 2000) {
  const allMatches = []
  let lastIdx: string | undefined

  while (allMatches.length < maxTotal) {
    const body: any = { matches: { subaccounts: [subaccount], limit: 500 } }
    if (lastIdx) body.matches.idx = lastIdx

    const res = await fetch(ARCHIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!data.matches?.length) break

    allMatches.push(...data.matches)
    lastIdx = data.matches[data.matches.length - 1].submission_idx
    if (data.matches.length < 500) break  // dernière page
  }
  return allMatches
}
```

## 7. Refresh Strategy

| Donnée | Méthode | Intervalle |
|---|---|---|
| Positions/Health | Polling `/api/wallet/[address]` | 30s |
| Trade history | Fetch initial + append on poll | 60s |
| Equity curve | Recalculée quand matches changent | Sur update |
| Market prices | Via WS Proxy SSE `best_bid_offer` | Temps réel |

> Positions temps réel nécessiterait `position_change` stream authentifié (clé privée du wallet) — impossible pour un wallet tiers. Le polling 30s est la seule option pour observer un wallet quelconque.

## 8. Points Nado
Non disponible via API publique. Ignorer pour MVP → "Points: coming soon".

---

*ARCHI.md v1.0 — NadoLens Wallet Explorer*
