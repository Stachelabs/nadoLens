# ARCHI.md — NadoLens Wallet Explorer Architecture
> Architecture technique pour la Feature Wallet Explorer — `/wallet/[address]`

---

## 1. Data Flow

```
Browser → /wallet/0xabc...
  │
  │ useWalletData(address) — hook client
  │
  ├── 1. fetch /api/wallet/{subaccount}?query=subaccount_info
  │         Next.js API Route → POST gateway.prod.nado.xyz/v1/query
  │         → health, balances, positions, oracle prices
  │
  └── 2. fetch archive.prod.nado.xyz/indexer
            POST { matches: { subaccount, limit: 200 } }
            → historique trades avec realized_pnl, fees

Résultats → WalletStats parsé dans useWalletData
         → composants wallet (WalletHeader, WalletStats, WalletPositions, etc.)

Refresh stratégie :
  - Positions : polling 30s via setInterval
  - Trade history : fetch initial uniquement (pas de polling)
```

---

## 2. Subaccount Resolution

Un wallet Ethereum (20 bytes) est converti en subaccount bytes32 côté client :

```typescript
function toSubaccount(address: string): string {
  const addr = address.toLowerCase().replace('0x', '')
  if (addr.length === 64) return `0x${addr}` // déjà bytes32
  return `0x${addr}64656661756c740000000000`  // "default" encodé
}
// Exemple : 0xc5a7... → 0xc5a7...64656661756c740000000000
```

---

## 3. API Route — `/api/wallet/[address]/route.ts`

Proxy léger côté serveur — évite les erreurs CORS du browser vers le Gateway Nado.

```
GET /api/wallet/{subaccount}?query=subaccount_info
  → POST https://gateway.prod.nado.xyz/v1/query
     body: { type: "subaccount_info", subaccount: "{subaccount}" }
  → réponse brute Gateway renvoyée au client

Validation adresse : /^0x[a-fA-F0-9]{40}$/ ou /^0x[a-fA-F0-9]{64}$/
```

La transformation x18 et le calcul des stats sont faits **côté client** dans `useWalletData`.

---

## 4. Composants React — état actuel

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
  useWalletData.ts     ← fetch + polling 30s → WalletData { stats, trades, loading, error }
  useAccount.ts        ← wrapper wagmi useAccount (wallet connecté)

store/
  accountStore.ts      ← Zustand — état wallet connecté

lib/schemas/nado.ts    ← NadoSubaccountDataSchema + ArchiveMatchesResponseSchema (Zod)
types/nado.ts          ← WalletStats, Position, TradeMatch, fromX18
```

---

## 5. Mapping API → UI

### WalletPositions
| Colonne | Source |
|---|---|
| Paire | `perp_products[i].product_id` → `productName()` mapping |
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
winRate = (trades.filter(t => parseFloat(t.realized_pnl) > 0).length / trades.length) * 100
totalPnl = sum(fromX18(t.realized_pnl))
totalVolume = sum(abs(fromX18(t.amount)) * fromX18(t.price))
avgTradeSize = totalVolume / trades.length
```

---

## 6. Pagination des matches

L'archive retourne max 500 matches par requête. Pour un trader actif il peut y en avoir des milliers. Implémentation actuelle : limit=200, pas de pagination (MVP). À étendre si besoin :

```typescript
async function fetchAllMatches(subaccount: string, maxTotal = 2000) {
  const all = []
  let lastIdx: string | undefined

  while (all.length < maxTotal) {
    const body = { matches: { subaccount, limit: 500, ...(lastIdx ? { idx: lastIdx } : {}) } }
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

## 7. Refresh Strategy

| Donnée | Méthode | Intervalle |
|---|---|---|
| Positions / Health | Polling `/api/wallet/[address]` | 30s |
| Trade history | Fetch initial uniquement | — |
| Equity curve | Recalculée quand `trades` change | Sur mount |

> Positions temps réel nécessiterait `position_change` stream authentifié (clé privée du wallet) — impossible pour un wallet tiers. Le polling 30s est la seule option pour observer un wallet quelconque.

---

## 8. Points Nado

Non disponible via API publique. Ignorer pour MVP → afficher "—" ou masquer.

---

*ARCHI.md v2.0 — NadoLens Wallet Explorer*
