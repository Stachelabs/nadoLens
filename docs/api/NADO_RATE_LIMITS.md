# NADO — Rate Limits, Errors & Changelog
> Source: https://docs.nado.xyz/developer-resources/api/rate-limits
> Auto-generated — regenerate when API changes

---

## Rate Limits — Overview

System based on **weights** applied per IP (queries) and per wallet (executes).

| Base | Limit | Applies to |
|---|---|---|
| IP | **2400 weight/min** or 400/10s | Queries (Gateway + Archive) |
| Wallet | **600 weight/min** or 100/10s | Executes |

---

## Archive Indexer — Weights

| Endpoint | Weight |
|---|---|
| Matches | `2 + (limit × subaccounts.length / 10)` |
| Orders | `2 + (limit × subaccounts.length / 20)` |
| Events | `2 + (limit × subaccounts.length / 10)` |
| Subaccounts | 2 |
| Isolated Subaccounts | 2 |
| Funding Rate | 2 |
| Interest & Funding Payments | 5 |
| Perp Prices | 2 |
| Oracle Price | 2 |
| Liquidation Feed | 2 |
| Ink Airdrop | 2 |
| Direct Deposit Address | 10 |
| Fast Withdrawal Signature | 10 |
| Sequencer Backlog | 1 |
| Quote Price | 2 |

### Calculation for Matches (NadoLens case)

```
limit=500, 1 subaccount → weight = 2 + (500 × 1 / 10) = 52
Max calls/min = 2400 / 52 ≈ 46 calls/min
Minimum interval = 60 / 46 ≈ 1.3 seconds between calls
```

> ⚠️ With multiple subaccounts in a single call, weight increases proportionally.
> Prefer passing max 1-2 subaccounts per call to stay within limits.

---

## Gateway Queries — Weights

| Query | Weight |
|---|---|
| Status | 1 |
| Contracts | 1 |
| Order | 1 |
| Market Liquidity | 1 |
| Nonces | 2 |
| Subaccount Info (basic) | 2 |
| Subaccount Info (with txns) | 10 |
| Subaccount Info (txns + pre_state) | 15 |
| Symbols | 2 |
| All Products | 5 |
| Orders | `2 × product_ids.length` |
| Market Prices | `product_ids.length` |
| Max Order Size | 5 |
| Isolated Positions | 10 |
| Fee Rates | 2 |
| Health Groups | 2 |
| Linked Signer | 5 |
| NLP Pool Info | 20 |
| NLP Locked Balances | 20 |

---

## Gateway Executes — Weights (per wallet)

| Execute | Weight |
|---|---|
| Place Order (with spot leverage) | 1 |
| Place Order (without spot leverage) | 20 |
| Cancel Orders (without digests) | 1 |
| Cancel Orders (with digests) | total digests |
| Cancel Product Orders (without productIds) | 50 |
| Cancel Product Orders (with productIds) | `5 × total productIds` |
| Withdraw (with spot leverage) | 10 |
| Withdraw (without spot leverage) | 20 |
| Liquidate Subaccount | 20 |
| Mint/Burn NLP | 10 |
| Link Signer | 30 (max 50 req/7 days) |
| Transfer Quote | 10 (max 5 new recipients/24h) |

---

## Handling 429 — Recommended strategy

### Exponential backoff

```typescript
async function fetchWithRetry(body: object, retries = 5, baseDelay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${ARCHIVE_URL}/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, br, deflate',
      },
      body: JSON.stringify(body),
    })

    if (res.status === 429) {
      // Backoff: 1s, 2s, 4s, 8s, 16s
      const delay = baseDelay * Math.pow(2, attempt)
      await new Promise(r => setTimeout(r, delay))
      continue
    }

    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }
  throw new Error('Max retries reached')
}
```

### Delay between pages

```typescript
// After each page, wait 200-300ms to avoid 429
await new Promise(r => setTimeout(r, 200))
```

### Redis cache (recommended for production)

```typescript
// Recommended TTLs
const STATS_TTL = 300    // 5 min for stats (changing)
const TRADES_TTL = 86400 // 24h for archive (immutable)
```

---

## Common error codes

| Code | Message | Cause |
|---|---|---|
| 2028 | Signature does not match | Wrong private key, wrong chain ID, wrong verifying contract |
| 2024 | Provided address has no previous deposits | Subaccount does not exist (no initial deposit ≥ $5 USDT0) |
| 2069 | MarketTradingBlocked | Market is `not_tradable` |
| 2117 | MarketPostOnlyMode | Market in `post_only`, non-post-only order rejected |
| 2118 | InvalidBuilder | Invalid builder ID or rates out of bounds |
| 2120 | CancelAndPlaceOrderFilled | Cancel-and-place cancelled because order had partial fills |
| 2121 | CancelAndPlaceCancelFailed | One or more cancels failed |
| 2122 | MarketIsolatedOnlyMode | Market is `isolated_only`, cross order rejected |

### Error format

```json
// Archive Indexer
{ "error": "message", "error_code": 2028 }

// Gateway Execute
{ "status": "failure", "signature": "...", "error": "message", "error_code": 2028, "request_type": "..." }

// Gateway Query
{ "status": "failure", "error": "message", "error_code": 2028, "request_type": "..." }
```

---

## Debugging — Signature checklist (Error 2028)

1. **Correct private key?** Print the address and compare to the wallet
2. **Linked signer?** Query `GET /query?type=linked_signer&subaccount={bytes32}` — if non-zero, use that key
3. **Correct chain ID?** Mainnet = 57073, Testnet = 763373
4. **Correct verifying contract?** Place Order → `address(product_id)`. Others → endpoint contract address
5. **Correct EIP-712 types?** `expiration` and `nonce` must be numbers (uint64), not strings
6. **Correct network?** Mainnet vs testnet

```bash
# Quick test without signature
curl "https://gateway.prod.nado.xyz/v1/query?type=contracts"
curl "https://gateway.prod.nado.xyz/v1/query?type=subaccount_info&subaccount={bytes32}"
```

---

## API Changelog — Recent changes

### March 2026

- **Cancel Orders**: now supports an optional `id` field echo-back in the response
- **Gateway /symbols**: now returns full product config (fee rates, weights...)
- **Archive orders**: new `prev_position` field (position before first fill, x18)
- **V2 /symbols**: new endpoint with `market_hours` (is_open, next_close, next_open) for non-24/7 markets

### February 2026

- **Archive matches**: new fields `closed_net_entry` and `margin` (per-match granularity)
- **Builder Code System**: new `builder_fee` field in orders and matches
- **Cancel And Place**: new `place_requires_unfilled` field
- **Errors**: codes 2120, 2121 added

### January 2026

- **Symbols**: new `trading_status` field (`live`, `post_only`, `not_tradable`)
- **Symbols**: new `isolated_only` field (boolean)
- **Errors**: codes 2069, 2117, 2122 added

### December 2025

- **Orders & Matches**: added `closed_amount` (x18) and `realized_pnl` (x18)
- ⚠️ Before December 2025, these fields did not exist

### November 2025 — Initial launch

- Multi-subaccount in events/matches/orders (`subaccounts` array)
- `place_orders` execute (multiple orders in one request)
- New Order struct with `appendix` (IOC, post-only, reduce-only, triggers, isolated)
- `quote_volume_cumulative` in events and subaccount_snapshots
- WebSocket streams: `funding_payment`, `liquidation`, `latest_candlestick`, `funding_rate`
