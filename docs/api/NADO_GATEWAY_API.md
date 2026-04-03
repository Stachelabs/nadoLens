# NADO Gateway API
> Source: https://docs.nado.xyz/developer-resources/api/gateway
> Auto-generated — regenerate when API changes

## Endpoints

| Network | Gateway WS | Gateway REST |
|---|---|---|
| **Mainnet** | `wss://gateway.prod.nado.xyz/v1/ws` | `https://gateway.prod.nado.xyz/v1` |
| **Testnet** | `wss://gateway.test.nado.xyz/v1/ws` | `https://gateway.test.nado.xyz/v1` |
| **Subscriptions** | `wss://gateway.prod.nado.xyz/v1/subscribe` | — |
| **V2** | — | `https://gateway.prod.nado.xyz/v2` |

Required headers: `Accept-Encoding: gzip, br, deflate`

WebSocket: send ping every 30s to keep the connection alive.

---

## Queries (read)

**REST:** `GET [GATEWAY_REST]/query?type=...` or `POST [GATEWAY_REST]/query`

**WebSocket:** JSON payload on `wss://gateway.prod.nado.xyz/v1/ws`

All amounts: normalized to 18 decimals (x18). Prices in x18 too.

### Subaccount Info

**Most important for NadoLens — current state of a subaccount.**

```
GET [GATEWAY_REST]/query?type=subaccount_info&subaccount={bytes32}
```

```json
// POST
{
  "type": "subaccount_info",
  "subaccount": "0xeae27ae6412147ed6d5692fd91709dad6dbfc34264656661756c740000000000"
}
```

Optional parameters:
- `txns`: list of simulated transactions (for preview before execution)
- `pre_state: "true"`: returns state before simulation (before/after comparison)

Response:
```json
{
  "status": "success",
  "data": {
    "subaccount": "0x...",
    "exists": true,
    "healths": [
      { "assets": "456895621098158389211471", "liabilities": "76286259844766495292488", "health": "380609361253391893918983" },
      { "assets": "...", "liabilities": "...", "health": "..." },
      { "assets": "...", "liabilities": "...", "health": "..." }
    ],
    "health_contributions": [ [...], [...], [...] ],
    "spot_count": 2,
    "perp_count": 1,
    "spot_balances": [
      { "product_id": 0, "balance": { "amount": "456895621098158389211471" } }
    ],
    "perp_balances": [
      {
        "product_id": 2,
        "balance": {
          "amount": "0",
          "v_quote_balance": "0",
          "last_cumulative_funding_x18": "-394223711772447555304"
        }
      }
    ],
    "spot_products": [...],
    "perp_products": [...]
  }
}
```

**Healths:**
- `healths[0]` = initial health (ability to open new positions)
- `healths[1]` = maintenance health (buffer before liquidation — if < 0 → liquidation)
- `healths[2]` = unweighted health

**Spot balance:** `amount` positive = deposit, negative = borrow
**Perp balance:** `amount` positive = long, negative = short

**Rate limit:** weight = 2 (without txns) | 1200 req/min

---

### Isolated Positions

```
GET [GATEWAY_REST]/query?type=isolated_positions&subaccount={bytes32}
```

Returns open isolated positions with their dedicated subaccount.

**Rate limit:** weight = 10

---

### All Products

```
GET [GATEWAY_REST]/query?type=all_products
```

Returns all available products (spot + perp) with their IDs, risk parameters, config.

**Rate limit:** weight = 5

---

### Market Prices

```
GET [GATEWAY_REST]/query?type=market_prices&product_id=2
```

**Rate limit:** weight = product_ids.length

---

### Fee Rates

```
GET [GATEWAY_REST]/query?type=fee_rates&subaccount={bytes32}
```

Returns the subaccount's maker/taker rates based on its volume tier.

**Rate limit:** weight = 2

---

### Orders (open orders)

```
GET [GATEWAY_REST]/query?type=orders&product_id=2&subaccount={bytes32}
```

**Rate limit:** weight = 2 × product_ids.length

---

### Symbols

```
GET [GATEWAY_REST]/query?type=symbols
```

Returns tradable symbols with status (`live`, `post_only`, `not_tradable`), `isolated_only`, and (since March 2026) market hours data.

---

## Executes (write)

**REST:** `POST [GATEWAY_REST]/execute`

All executes are signed via **EIP-712**. The signature must match the wallet or the linked signer.

### Place Order

```json
{
  "place_order": {
    "product_id": 1,
    "order": {
      "sender": "0x7a5ec2748e9065794491a8d29dcf3f9edb8d7c43746573743000000000000000",
      "priceX18": "1000000000000000000",
      "amount": "1000000000000000000",
      "expiration": "4294967295",
      "nonce": "1757062078359666688",
      "appendix": "1537"
    },
    "signature": "0x..."
  }
}
```

Order parameters:
| Field | Type | Description |
|---|---|---|
| sender | bytes32 | address (20 bytes) + subaccount name (12 bytes) |
| priceX18 | int128 (string) | Price × 1e18 |
| amount | int128 (string) | Quantity × 1e18. Positive = buy, negative = sell |
| expiration | uint64 (string) | Expiration timestamp (seconds) |
| nonce | uint64 (string) | Unique order identifier |
| appendix | uint128 (string) | Encodes order type, isolated, triggers... |

**Appendix bitfield:**
```
| value | builder | builder fee rate | reserved | trigger | reduce only | order type | isolated | version |
| 64b   | 16b     | 10b              | 24b      | 2b      | 1b          | 2b         | 1b       | 8b      |
```

**Verifying contract for Place Order:** `address(product_id)` — e.g.: product 2 → `0x0000000000000000000000000000000000000002`

**Rate limit (with spot leverage):** 600 orders/min | weight = 1

---

### Cancel Orders

```json
{
  "cancel_orders": {
    "tx": {
      "sender": "0x...",
      "productIds": [1],
      "digests": ["0x..."],
      "nonce": "1688768157050"
    },
    "signature": "0x...",
    "id": 100
  }
}
```

**Rate limit:** weight = 1 (without digests) or total digests

---

### Withdraw Collateral

```json
{
  "withdraw_collateral": {
    "tx": {
      "sender": "0x...",
      "productId": 0,
      "amount": "1000000",
      "nonce": "1688768157050"
    },
    "signature": "0x..."
  }
}
```

**Amount for withdraw/deposit:** physical token amount (e.g.: 1 USDT0 at 6 decimals = `1000000`)

---

### Signing — EIP-712

| Network | Chain ID |
|---|---|
| Mainnet (Ink) | 57073 |
| Testnet (Ink Sepolia) | 763373 |

**Domain:**
```typescript
{
  name: 'Nado',
  version: '0.0.1',
  chainId: 763373,           // Testnet. Mainnet = 57073
  verifyingContract: ...     // place_order → address(product_id) e.g.: product 2 → "0x0000...0002"
                             // all other executes → endpoint_addr (via query contracts)
}
```

**EIP-712 types per execute:**

| Execute | PrimaryType | Struct fields |
|---|---|---|
| `place_order` | `Order` | sender(b32), priceX18(i128), amount(i128), expiration(u64), nonce(u64), appendix(u128) |
| `cancel_orders` | `Cancellation` | sender(b32), productIds(u32[]), digests(b32[]), nonce(u64) |
| `cancel_product_orders` | `CancellationProducts` | sender(b32), productIds(u32[]), nonce(u64) |
| `withdraw_collateral` | `WithdrawCollateral` | sender(b32), productId(u32), amount(u128), nonce(u64) |
| `liquidate_subaccount` | `LiquidateSubaccount` | sender(b32), liquidatee(b32), productId(u32), isEncodedSpread(bool), amount(i128), nonce(u64) |
| `link_signer` | `LinkSigner` | sender(b32), signer(b32), nonce(u64) |

**Nonce for `place_order`:**
```
nonce = ((unix_epoch_ms + 50) << 20) + random_int
// bits 44:63 = recv_time_ms, bits 0:19 = random
```

---

## Sender format (bytes32)

```
bytes32 = wallet_address (20 bytes) + subaccount_name (12 bytes)

Example:
wallet: 0x7a5ec2748e9065794491a8d29dcf3f9edb8d7c43
name: "default" → hex: 746573743000000000000000
sender: 0x7a5ec2748e9065794491a8d29dcf3f9edb8d7c43746573743000000000000000
```

---

## Subscriptions (WebSocket)

**Endpoint:** `wss://gateway.prod.nado.xyz/v1/subscribe`

Available streams (subscribe with `{ "method": "subscribe", "stream": { "type": "...", "product_id": N } }`):

| Stream | Type | Description |
|---|---|---|
| `best_bid_offer` | market data | Best bid/ask in real time |
| `market_trade` | market data | Public trades |
| `fill` | account | My order fills |
| `order_update` | account | My order updates |
| `position_change` | account | Position changes |
| `funding_payment` | account | Funding payments (hourly) |
| `funding_rate` | market | Funding rate (every 20s) |
| `liquidation` | market | Liquidation events |
| `latest_candlestick` | market | Real-time candlesticks |

---

## V2 REST API

**Base URL:** `https://gateway.prod.nado.xyz/v2`

```
GET /v2/symbols              → all symbols with market hours
GET /v2/symbols?product_type=perp
```

New fields in V2 symbols: `market_hours` (is_open, next_close, next_open) — useful for non-24/7 markets (metals, energy, forex).

---

## TypeScript SDK (optional)

> NadoLens does not use the SDK — API consumed via direct fetch. Reference here for future executes.

```bash
pnpm add @nadohq/client viem bignumber.js
```

| Package | Usage |
|---|---|
| `@nadohq/client` | Main client — `createNadoClient('inkMainnet', { walletClient, publicClient })` |
| `@nadohq/engine-client` | Off-chain sequencer (queries/executes) |
| `@nadohq/indexer-client` | Historical data |
| `@nadohq/trigger-client` | TP/SL/TWAP orders |
| `@nadohq/shared` | Utilities, EIP-712 signing, bignumber.js |

> SDK v1.x.x uses **viem** (chains `ink`/`inkSepolia` from `viem/chains`)

```typescript
import { createNadoClient } from '@nadohq/client'
import { createWalletClient, createPublicClient, http } from 'viem'
import { ink } from 'viem/chains'

const client = createNadoClient('inkMainnet', { walletClient, publicClient })
const info = await client.subaccount.getSubaccountSummary({
  subaccountOwner: account.address,
  subaccountName: 'default',
})
```
