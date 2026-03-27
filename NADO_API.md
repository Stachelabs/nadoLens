# NADO_API.md — Référence complète Nado Developer API
> Source : https://docs.nado.xyz/developer-resources/
> Vérifié par scraping Exa le 2026-03-19

---

## Endpoints officiels (source : docs.nado.xyz/developer-resources/api/endpoints)

### Mainnet (Ink)

| Service | URL |
|---|---|
| Gateway REST | `https://gateway.prod.nado.xyz/v1` |
| Gateway WebSocket | `wss://gateway.prod.nado.xyz/v1/ws` |
| Gateway V2 REST | `https://gateway.prod.nado.xyz/v2` |
| Subscriptions WS | `wss://gateway.prod.nado.xyz/v1/subscribe` |
| Archive (Indexer) v1 | `https://archive.prod.nado.xyz/v1` |
| Archive (Indexer) V2 | `https://archive.prod.nado.xyz/v2` |
| Trigger | `https://trigger.prod.nado.xyz/v1` |

### Testnet (Ink Sepolia)

| Service | URL |
|---|---|
| Gateway REST | `https://gateway.test.nado.xyz/v1` |
| Gateway WebSocket | `wss://gateway.test.nado.xyz/v1/ws` |
| Gateway V2 REST | `https://gateway.test.nado.xyz/v2` |
| Subscriptions WS | `wss://gateway.test.nado.xyz/v1/subscribe` |
| Archive (Indexer) v1 | `https://archive.test.nado.xyz/v1` |
| Archive (Indexer) V2 | `https://archive.test.nado.xyz/v2` |
| Trigger | `https://trigger.test.nado.xyz/v1` |

> ⚠️ `gateway.nado.xyz` et `archive.nado.xyz` sont morts (404)
> ⚠️ L'ancien endpoint `archive.prod.nado.xyz/indexer` peut encore marcher, mais l'officiel est `/v1`

### Deux WebSocket distincts — ne pas confondre

| WS | URL | Format message | Usage |
|---|---|---|---|
| **Gateway WS** | `.../v1/ws` | `{ "type": "status" }` | Queries + Executes en temps réel |
| **Subscriptions WS** | `.../v1/subscribe` | `{ "method": "subscribe", "stream": {...}, "id": 1 }` | Streams temps réel (trades, book, liquidations) |

---

## Conventions

- Valeurs numériques v1 : **x18** = `value * 1e18` (string). Ex: BTC à $84500 → `"84500000000000000000000"`
- ⚠️ **V2 exception** : `/v2/tickers` et `/v2/trades` retournent des **décimaux normaux** (pas x18)
- Subaccount = bytes32 hex : `0x{address_20b}{name_12b}` — "default" = `64656661756c740000000000`
- Archive requests : header `Accept-Encoding: gzip` obligatoire
- Gateway v1 response : `{ status: "success"|"failure", data?, error?, error_code?, request_type }`
- Chain ID Ink L2 mainnet : **763373** | Ink Sepolia testnet : **763373** (même chain ID? à vérifier)
- Endpoint contract : `0xf8963f7860af7de9b94893edb9a3b5c155e1fc0c` (via query `contracts`)

### addressToSubaccount
```typescript
function addressToSubaccount(address: string, name = 'default'): string {
  const addr = address.toLowerCase().replace('0x', '')
  const nameHex = Buffer.from(name).toString('hex').padEnd(24, '0')
  return `0x${addr}${nameHex}`
}
```

---

## Rate Limits (source : docs.nado.xyz/developer-resources/api/rate-limits)

### Queries — IP based, max 2400 weight/min ou 400/10s

| Query | Weight |
|---|---|
| `status`, `contracts`, `order`, `market_price`, `market_liquidity` | 1 |
| `subaccount_info` (basic) | 2 |
| `subaccount_info` (+ `txns`) | 10 |
| `subaccount_info` (+ `txns` + `pre_state`) | 15 |
| `nonces`, `symbols`, `fee_rates`, `insurance`, `health_groups`, `assets` | 2 |
| `all_products`, `edge_all_products`, `max_order_size`, `max_withdrawable`, `linked_signer` | 5 |
| `market_prices` | product_ids.length |
| `subaccount_orders` | 2 |
| `orders` (multi-product) | 2 × product_ids.length |
| `isolated_positions` | 10 |
| `nlp_pool_info`, `nlp_locked_balances`, `max_nlp_mintable`, `max_nlp_burnable` | 20 |

### Executes — Wallet based, max 600 weight/min ou 100/10s

| Execute | Weight |
|---|---|
| `place_order` (spot leverage) | 1 |
| `place_order` (sans) | 20 |
| `cancel_orders` (avec digests) | total digests |
| `cancel_orders` (sans) | 1 |
| `cancel_product_orders` (avec productIds) | 5 × total |
| `cancel_product_orders` (sans) | 50 |
| `withdraw_collateral` | 10 (spot lev) / 20 (sans) |
| `mint_nlp`, `burn_nlp` | 10 |
| `liquidate_subaccount` | 20 |
| `transfer_quote` | 10 (max 5 recipients/24h) |
| `link_signer` | 30 (max 50/7j/subaccount) |

### Archive — IP based, max 2400 weight/min
| Query | Weight |
|---|---|
| `matches` | 2 + (limit × subaccounts.length / 10) |
| `orders` | 2 + (limit × subaccounts.length / 20) |
| `events` | 2 + (limit × subaccounts.length / 10) |
| `candlesticks` | 1 + limit / 20 |
| `subaccounts` | 2 |

### WS Subscriptions
- Max 100 connections/IP | 5 auth connections/wallet | 500 ordres ouverts/subaccount/marché
- Trigger : max 25 pending trigger orders/product/subaccount

---

## Gateway v1 — Queries

**REST :** `GET/POST https://gateway.prod.nado.xyz/v1/query`
**WS :** `wss://gateway.prod.nado.xyz/v1/ws` → `{ "type": "..." }`

### contracts
`{ "type": "contracts" }` → `{ chain_id: "763373", endpoint_addr: "0xf8963f7860af7de9b94893edb9a3b5c155e1fc0c" }`

### subaccount_info
```json
{ "type": "subaccount_info", "subaccount": "0x...bytes32" }
// Optionnel simulation : ajouter "txns": "[{\"apply_delta\":{...}}]", "pre_state": "true"
```
Response : `{ healths[0]=initial, [1]=maintenance, [2]=unweighted, spot_balances, perp_balances, perp_products (oracle_price_x18, risk weights, book_info) }`

### market_price / market_prices
```json
{ "type": "market_price", "product_id": 1 }
// → { product_id, bid_x18, ask_x18 }

{ "type": "market_prices", "product_ids": [1, 2] }
// → { market_prices: [{ product_id, bid_x18, ask_x18 }] }
```

### subaccount_orders (single) / orders (multi)
```json
{ "type": "subaccount_orders", "sender": "0x...", "product_id": 1 }
// → { orders: [{ product_id, sender, price_x18, amount, unfilled_amount, digest, placed_at, order_type }] }
// order_type: "default" | "ioc" | "fok" | "post_only" | amount: +buy, -sell

{ "type": "orders", "sender": "0x...", "product_ids": [1, 2] }
// → { product_orders: [{ product_id, orders: [...] }] }
```

### all_products
`{ "type": "all_products" }` → même structure que perp/spot_products dans subaccount_info

---

## Gateway v1 — Executes + EIP-712 Signing

**REST :** `POST https://gateway.prod.nado.xyz/v1/execute`
**WS :** `wss://gateway.prod.nado.xyz/v1/ws`

### Domain EIP-712
```typescript
{ name: 'Nado', version: '0.0.1', chainId: 763373, verifyingContract: contractAddress }
// place_order → verifyingContract = address(productId) ex: product 2 → "0x000...0002"
// tout le reste → endpoint_addr (via contracts query)
```

### EIP-712 Types par execute
| Execute | PrimaryType | Struct fields |
|---|---|---|
| `place_order` | `Order` | sender(b32), priceX18(i128), amount(i128), expiration(u64), nonce(u64), appendix(u128) |
| `cancel_orders` | `Cancellation` | sender(b32), productIds(u32[]), digests(b32[]), nonce(u64) |
| `cancel_product_orders` | `CancellationProducts` | sender(b32), productIds(u32[]), nonce(u64) |
| `withdraw_collateral` | `WithdrawCollateral` | sender(b32), productId(u32), amount(u128), nonce(u64) |
| `liquidate_subaccount` | `LiquidateSubaccount` | sender(b32), liquidatee(b32), productId(u32), isEncodedSpread(bool), amount(i128), nonce(u64) |
| `link_signer` | `LinkSigner` | sender(b32), signer(b32), nonce(u64) |

### Nonce pour place_order
```python
nonce = ((unix_epoch_ms + 50) << 20) + random_int  # bits 44:63 = recv_time_ms, bits 0:19 = random
```

---

## Subscriptions WS — Streams temps réel

**URL :** `wss://gateway.prod.nado.xyz/v1/subscribe`
**Headers :** `Sec-WebSocket-Extensions: permessage-deflate` | Ping 30s | `id` obligatoire

### Subscribe : `{ "method": "subscribe", "stream": { "type": "...", ... }, "id": N }`
### ACK : `{ "result": null, "id": N }` | Error : `{ "result": null, "error": "...", "id": N }`

| Stream | Auth | Scope | product_id |
|---|---|---|---|
| `trade` | Non | per-product | requis |
| `best_bid_offer` | Non | per-product | requis |
| `book_depth` | Non | per-product (~50ms batches) | requis |
| `liquidation` | Non | optional per-product | null = tout |
| `latest_candlestick` | Non | per-product + granularity | requis |
| `funding_rate` | Non | optional per-product (~20s) | null = tout |
| `funding_payment` | Non | per-product (hourly) | requis |
| `fill` | Non | per-subaccount, opt per-product | null = tout |
| `position_change` | Non | per-subaccount, opt per-product | null = tout |
| `order_update` | **Oui** | per-subaccount, opt per-product | null = tout |

### Event payloads compacts
- **liquidation** : `{ type, timestamp(ns), product_ids[], liquidator(b32), liquidatee(b32), amount(x18 +long/-short), price(x18) }`
- **book_depth** : `{ type, product_id, min/max/last_max_timestamp(ns), bids: [price_x18, size_x18][], asks }` — size "0" = supprimé
- **best_bid_offer** : `{ type, timestamp(ns), product_id, bid_price(x18), bid_qty(x18), ask_price(x18), ask_qty(x18) }`
- **fill** : `{ type, timestamp(ns), product_id, subaccount, order_digest, filled_qty(x18), remaining_qty(x18), original_qty(x18), price(x18), is_taker, is_bid, fee(x18), submission_idx }`
- **position_change** : `{ type, timestamp(ns), product_id, subaccount, isolated, amount(x18 absolute), v_quote_amount(x18), reason }`
- **order_update** : `{ type, timestamp(ns), product_id, digest, amount(x18 unfilled), reason: "placed"|"filled"|"cancelled" }`
- **trade** : `{ type, timestamp(ns), product_id, price(x18), taker_qty(x18), maker_qty(x18), is_taker_buyer }`
- **latest_candlestick** : `{ type, timestamp(unix_s), product_id, granularity(s), open/high/low/close_x18, volume(x18) }`
- **funding_rate** : `{ type, timestamp(ns), product_id, funding_rate_x18, update_time(unix_s) }`
- **funding_payment** : `{ type, timestamp(ns), product_id, payment_amount(x18), open_interest(x18), cumulative_funding_long/short_x18, dt(ns) }`

---

## Gateway V2 REST — `https://gateway.prod.nado.xyz/v2`

| Endpoint | Response |
|---|---|
| `GET /pairs?market=perp` | `[{ product_id, ticker_id: "BTC-PERP_USDT0", base, quote, market_type }]` |
| `GET /orderbook?ticker_id=BTC-PERP_USDT0&depth=20` | `{ ticker_id, timestamp, bids: [[price,size]], asks }` ⚠️ param = `ticker_id` |
| `GET /assets` | `[{ product_id, name, symbol, maker_fee, taker_fee, can_withdraw, can_deposit, ticker_id, market_type }]` — **source préférée** : inclut tous les assets (spot + perp + USDT0) |

### `/v2/assets` — Assets connus (live, vérifié 2026-03-27)

**Spot (can_withdraw/deposit = true) :**
| product_id | symbol | name |
|---|---|---|
| 0 | USDT0 | USDT0 (collateral quote, market_type = null) |
| 1 | KBTC | Kraken Wrapped BTC |
| 3 | WETH | Wrapped ETH |
| 5 | USDC | USDC |
| 11 | NLP | Nado LP |

**Perp (~50 marchés, market_type = "perp") — IDs clés :**
| product_id | symbol |
|---|---|
| 2 | BTC-PERP |
| 4 | ETH-PERP |
| 8 | SOL-PERP |
| 10 | XRP-PERP |
| 14 | BNB-PERP |
| 16 | HYPE-PERP |
| 22 | FARTCOIN-PERP |
| 24 | SUI-PERP |
| 52 | DOGE-PERP |
| 90 | WTI-PERP (pétrole) |
| 100 | SPY-PERP (S&P 500) |

> ⚠️ Préférer `/v2/assets` à `/v2/pairs?market=perp` — inclut USDT0 (product_id=0) et les spots nécessaires au calcul de la valeur des collaterals.

## Archive V2 REST — `https://archive.prod.nado.xyz/v2`

| Endpoint | Response |
|---|---|
| `GET /tickers?market=perp` | `{ "BTC-PERP_USDT0": { product_id, last_price(décimal!), base_volume, quote_volume, price_change_percent_24h } }` |
| `GET /trades?ticker_id=BTC-PERP_USDT0&limit=100` | `[{ product_id, trade_id, price(décimal!), base_filled, quote_filled, timestamp(unix_s), trade_type }]` |

> ⚠️ V2 retourne des décimaux normaux, PAS x18

---

## Archive v1 — `POST https://archive.prod.nado.xyz/v1`
Header : `Accept-Encoding: gzip`

### subaccounts — résolution adresse → bytes32
`{ "subaccounts": { "address": "0x..." } }` → `{ subaccounts: [{ subaccount(b32), address, subaccount_name, isolated }] }`

### matches — historique trades (pagination via `idx`, max 500/req)
```json
{ "matches": { "subaccounts": ["0x...b32"], "product_ids": [1,2], "limit": 500, "idx": "last_submission_idx" } }
```
→ `{ matches: [{ digest, order: {sender, priceX18, amount}, base_filled(x18), quote_filled(x18), fee(x18), realized_pnl(x18), closed_amount(x18), submission_idx, is_taker, pre_balance, post_balance }], txs: [...] }`
> Pagination : `idx` = submission_idx du dernier match → retourne les précédents (desc)
> `fee` inclut taker/maker + sequencer fees

### orders — historique ordres
`{ "orders": { "subaccounts": ["0x..."], "limit": 100 } }`
→ `{ orders: [{ digest, subaccount, product_id, amount(x18), price_x18, base_filled, fee, realized_pnl, first/last_fill_timestamp }] }`

### events
`{ "events": { "subaccounts": [...], "event_types": ["liquidate_subaccount"|"deposit_collateral"|"withdraw_collateral"|"settle_pnl"|"match_orders"|"mint_lp"|"burn_lp"], "limit": {"raw": 100} } }`

### account_snapshots — ⚠️ réponse = `snapshots` pas `account_snapshots`
`{ "account_snapshots": { "subaccounts": [...], "timestamps": [...] } }` → `{ snapshots: {...} }`

### candlesticks
`{ "candlesticks": { "product_id": 1, "granularity": 60, "limit": 100 } }`
→ `{ candlesticks: [{ timestamp(unix_s), open/high/low/close_x18, volume(x18) }] }`

---

## TypeScript SDK

```bash
pnpm add @nadohq/client viem bignumber.js
```

| Package | Usage |
|---|---|
| `@nadohq/client` | Client principal — `createNadoClient('inkMainnet', { walletClient, publicClient })` |
| `@nadohq/engine-client` | Sequencer off-chain (queries/executes) |
| `@nadohq/indexer-client` | Données historiques |
| `@nadohq/trigger-client` | TP/SL/TWAP orders |
| `@nadohq/shared` | Utilitaires, EIP712 signing, bignumber.js |

> SDK v1.x.x utilise **viem** (chains `ink`/`inkSepolia` de `viem/chains`)

```typescript
// Exemple SDK
import { createNadoClient } from '@nadohq/client';
import { createWalletClient, http, createPublicClient } from 'viem';
import { ink } from 'viem/chains';
const client = createNadoClient('inkMainnet', { walletClient, publicClient });
const info = await client.subaccount.getSubaccountSummary({
  subaccountOwner: account.address, subaccountName: 'default'
});
```

---

## Bugs identifiés NadoLens

| Fichier | Bug | Fix |
|---|---|---|
| `hooks/useNadoPairs.ts` | Attend `{ pair }` mais API = `{ ticker_id, base, quote }` | Update schema |
| `app/api/orderbook/route.ts` | `?pair=BTCUSDT0` mais API = `?ticker_id=BTC-PERP_USDT0&depth=N` | Fix param |
| `app/api/predicted-liquidations/route.ts` | Parse `data.account_snapshots` mais réponse = `data.snapshots` | Fix key |

---

*NADO_API.md v3.1 — Vérifié contre docs.nado.xyz via Exa · 2026-03-19 · `/v2/assets` ajouté 2026-03-27*
