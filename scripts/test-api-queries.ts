/**
 * test-api-queries.ts
 * Tests all Nado read-only endpoints against Zod schemas.
 * Usage: pnpm test:api
 * Output: scripts/output/test-api-YYYY-MM-DD-HH-MM.json
 */

import { writeFileSync, mkdirSync } from 'fs'
import { z } from 'zod'
import {
  ContractsDataSchema,
  NadoSubaccountDataSchema,
  MarketPriceSchema,
  MarketPricesDataSchema,
  SubaccountOrdersDataSchema,
  ProductOrdersDataSchema,
  AllProductsDataSchema,
  ArchiveSubaccountsResponseSchema,
  ArchiveMatchesResponseSchema,
  ArchiveOrdersResponseSchema,
  ArchiveLiqResponseSchema,
  CandlesticksResponseSchema,
  PairsResponseSchema,
  V2AssetsResponseSchema,
  V2OrderbookResponseSchema,
  TickersResponseSchema,
} from '../lib/schemas/nado'

// ─── Config ───────────────────────────────────────────────────────────────────

const GATEWAY_V1 = 'https://gateway.prod.nado.xyz/v1'
const GATEWAY_V2 = 'https://gateway.prod.nado.xyz/v2'
const ARCHIVE_V1 = 'https://archive.prod.nado.xyz/v1'
const ARCHIVE_V2 = 'https://archive.prod.nado.xyz/v2'

// Public address with known activity on Nado (used only for read queries)
const TEST_ADDRESS = '0xeae27ae6412147ed6d5692fd91709dad6dbfc342'
const TEST_SUBACCOUNT = `${TEST_ADDRESS}64656661756c740000000000`
const BTC_PRODUCT_ID = 2

// ─── Types ────────────────────────────────────────────────────────────────────

type TestResult = {
  endpoint: string
  request: unknown
  status: 'success' | 'zod_error' | 'http_error' | 'network_error'
  durationMs: number
  httpStatus?: number
  raw?: unknown
  parsed?: unknown
  zodErrors?: z.core.$ZodIssue[]
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function queryGatewayV1<T extends z.ZodTypeAny>(
  label: string,
  body: Record<string, unknown>,
  schema: T
): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${GATEWAY_V1}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const durationMs = Date.now() - start
    const raw = await res.json()

    if (!res.ok) {
      return { endpoint: label, request: body, status: 'http_error', durationMs, httpStatus: res.status, raw }
    }

    // Unwrap gateway envelope — parse inner data field
    const dataPayload = (raw as Record<string, unknown>).data ?? raw
    const result = schema.safeParse(dataPayload)

    if (result.success) {
      return { endpoint: label, request: body, status: 'success', durationMs, httpStatus: res.status, raw, parsed: result.data }
    } else {
      return { endpoint: label, request: body, status: 'zod_error', durationMs, httpStatus: res.status, raw, zodErrors: result.error.issues }
    }
  } catch (err) {
    return { endpoint: label, request: body, status: 'network_error', durationMs: Date.now() - start, error: String(err) }
  }
}

async function queryArchiveV1<T extends z.ZodTypeAny>(
  label: string,
  body: Record<string, unknown>,
  schema: T
): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${ARCHIVE_V1}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
      body: JSON.stringify(body),
    })
    const durationMs = Date.now() - start
    const raw = await res.json()

    if (!res.ok) {
      return { endpoint: label, request: body, status: 'http_error', durationMs, httpStatus: res.status, raw }
    }

    const result = schema.safeParse(raw)
    if (result.success) {
      return { endpoint: label, request: body, status: 'success', durationMs, httpStatus: res.status, raw, parsed: result.data }
    } else {
      return { endpoint: label, request: body, status: 'zod_error', durationMs, httpStatus: res.status, raw, zodErrors: result.error.issues }
    }
  } catch (err) {
    return { endpoint: label, request: body, status: 'network_error', durationMs: Date.now() - start, error: String(err) }
  }
}

async function queryV2Get<T extends z.ZodTypeAny>(
  label: string,
  url: string,
  schema: T
): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(url)
    const durationMs = Date.now() - start
    const raw = await res.json()

    if (!res.ok) {
      return { endpoint: label, request: { url }, status: 'http_error', durationMs, httpStatus: res.status, raw }
    }

    const result = schema.safeParse(raw)
    if (result.success) {
      return { endpoint: label, request: { url }, status: 'success', durationMs, httpStatus: res.status, raw, parsed: result.data }
    } else {
      return { endpoint: label, request: { url }, status: 'zod_error', durationMs, httpStatus: res.status, raw, zodErrors: result.error.issues }
    }
  } catch (err) {
    return { endpoint: label, request: { url }, status: 'network_error', durationMs: Date.now() - start, error: String(err) }
  }
}

// ─── Print ────────────────────────────────────────────────────────────────────

function printResult(r: TestResult) {
  const icon = r.status === 'success' ? '✓' : r.status === 'zod_error' ? '⚠' : '✗'
  const color = r.status === 'success' ? '\x1b[32m' : r.status === 'zod_error' ? '\x1b[33m' : '\x1b[31m'
  const reset = '\x1b[0m'

  console.log(`${color}[${icon}]${reset} ${r.endpoint.padEnd(30)} ${String(r.durationMs).padStart(5)}ms  HTTP:${r.httpStatus ?? '—'}`)

  if (r.status === 'zod_error' && r.zodErrors) {
    for (const issue of r.zodErrors.slice(0, 5)) {
      console.log(`     ${'\x1b[33m'}ZodError${reset} [${issue.path.join('.')}] ${issue.message}`)
    }
    if (r.zodErrors.length > 5) {
      console.log(`     ... and ${r.zodErrors.length - 5} more`)
    }
  }

  if (r.status === 'http_error' || r.status === 'network_error') {
    console.log(`     ${'\x1b[31m'}${r.error ?? JSON.stringify(r.raw)}${reset}`)
  }
}

// ─── Run all tests ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mNadoLens — API Query Test\x1b[0m')
  console.log(`${'─'.repeat(60)}`)
  console.log(`Gateway:  ${GATEWAY_V1}`)
  console.log(`Archive:  ${ARCHIVE_V1}`)
  console.log(`Test subaccount: ${TEST_SUBACCOUNT}`)
  console.log(`${'─'.repeat(60)}\n`)

  const results: TestResult[] = []

  // ── Gateway v1 ──────────────────────────────────────────────
  console.log('\x1b[1mGateway v1\x1b[0m')

  results.push(await queryGatewayV1('contracts', { type: 'contracts' }, ContractsDataSchema))

  results.push(await queryGatewayV1('all_products', { type: 'all_products' }, AllProductsDataSchema))

  results.push(await queryGatewayV1('market_price (BTC)', { type: 'market_price', product_id: BTC_PRODUCT_ID }, MarketPriceSchema))

  results.push(await queryGatewayV1('market_prices [2,3,4]', { type: 'market_prices', product_ids: [2, 3, 4] }, MarketPricesDataSchema))

  results.push(await queryGatewayV1('subaccount_info', { type: 'subaccount_info', subaccount: TEST_SUBACCOUNT }, NadoSubaccountDataSchema))

  results.push(await queryGatewayV1('subaccount_orders', { type: 'subaccount_orders', sender: TEST_SUBACCOUNT, product_id: BTC_PRODUCT_ID }, SubaccountOrdersDataSchema))

  results.push(await queryGatewayV1('orders (multi)', { type: 'orders', sender: TEST_SUBACCOUNT, product_ids: [2, 3, 4] }, ProductOrdersDataSchema))

  for (const r of results.slice(-7)) printResult(r)

  // ── Archive v1 ──────────────────────────────────────────────
  console.log('\n\x1b[1mArchive v1\x1b[0m')

  const archiveResults: TestResult[] = []

  archiveResults.push(await queryArchiveV1('subaccounts', { subaccounts: { address: TEST_ADDRESS } }, ArchiveSubaccountsResponseSchema))

  archiveResults.push(await queryArchiveV1('matches (limit 10)', { matches: { subaccounts: [TEST_SUBACCOUNT], limit: 10 } }, ArchiveMatchesResponseSchema))

  archiveResults.push(await queryArchiveV1('orders (limit 10)', { orders: { subaccounts: [TEST_SUBACCOUNT], limit: 10 } }, ArchiveOrdersResponseSchema))

  archiveResults.push(await queryArchiveV1('events (liquidations)', {
    events: {
      subaccounts: [TEST_SUBACCOUNT],
      event_types: ['liquidate_subaccount'],
      limit: { raw: 10 },
    },
  }, ArchiveLiqResponseSchema))

  archiveResults.push(await queryArchiveV1('candlesticks (BTC 1h)', { candlesticks: { product_id: BTC_PRODUCT_ID, granularity: 3600, limit: 5 } }, CandlesticksResponseSchema))

  for (const r of archiveResults) printResult(r)
  results.push(...archiveResults)

  // ── Gateway V2 ──────────────────────────────────────────────
  console.log('\n\x1b[1mGateway V2\x1b[0m')

  const v2Results: TestResult[] = []

  v2Results.push(await queryV2Get('GET /v2/pairs?market=perp', `${GATEWAY_V2}/pairs?market=perp`, PairsResponseSchema))

  v2Results.push(await queryV2Get('GET /v2/assets', `${GATEWAY_V2}/assets`, V2AssetsResponseSchema))

  v2Results.push(await queryV2Get('GET /v2/orderbook (BTC)', `${GATEWAY_V2}/orderbook?ticker_id=BTC-PERP_USDT0&depth=5`, V2OrderbookResponseSchema))

  for (const r of v2Results) printResult(r)
  results.push(...v2Results)

  // ── Archive V2 ──────────────────────────────────────────────
  console.log('\n\x1b[1mArchive V2\x1b[0m')

  const av2Results: TestResult[] = []

  av2Results.push(await queryV2Get('GET /v2/tickers?market=perp', `${ARCHIVE_V2}/tickers?market=perp`, TickersResponseSchema))

  for (const r of av2Results) printResult(r)
  results.push(...av2Results)

  // ── Summary ─────────────────────────────────────────────────
  const ok = results.filter(r => r.status === 'success').length
  const warn = results.filter(r => r.status === 'zod_error').length
  const fail = results.filter(r => r.status === 'http_error' || r.status === 'network_error').length

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`\x1b[1mTotal: ${results.length}\x1b[0m  ` +
    `\x1b[32m✓ ${ok} success\x1b[0m  ` +
    `\x1b[33m⚠ ${warn} zod_error\x1b[0m  ` +
    `\x1b[31m✗ ${fail} failed\x1b[0m`)

  // ── Save JSON output ────────────────────────────────────────
  mkdirSync('scripts/output', { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
  const outPath = `scripts/output/test-api-${ts}.json`
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nSaved → ${outPath}\n`)
}

main().catch(err => {
  console.error('\x1b[31mFatal:\x1b[0m', err)
  process.exit(1)
})
