import { NextRequest, NextResponse } from 'next/server'
import { fromX18 } from '@/types/nado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel Pro — 60s timeout for full scan

const ARCHIVE = 'https://archive.prod.nado.xyz/indexer'
const ARCHIVE_V2 = 'https://archive.prod.nado.xyz/v2'

export interface PredictedLiqLevel {
  priceLow: number
  priceHigh: number
  longNotional: number
  shortNotional: number
}

interface PredictedLiqResponse {
  levels: PredictedLiqLevel[]
  oraclePrice: number
  productId: number
  totalAccountsScanned: number
  positionsFound: number
}

// Known fallback maint weights (from product risk params in the existing codebase)
// long_weight_maintenance for major perps is ~0.9875 → 1.25% maint rate
const KNOWN_MAINT_WEIGHTS: Record<number, number> = {
  2: 0.9875,  // BTC
  4: 0.9875,  // ETH
  8: 0.975,   // SOL
  10: 0.95,   // ARB
  14: 0.95,   // BNB
  16: 0.95,   // AVAX
  18: 0.95,   // OP
  20: 0.95,   // MATIC
  22: 0.95,   // DOGE
  24: 0.95,   // LINK
}

// Fetch ONE page of subaccounts
async function fetchSubaccountsPage(start: number, limit = 500): Promise<string[]> {
  try {
    const res = await fetch(ARCHIVE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
      body: JSON.stringify({ subaccounts: { start, limit } }),
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { subaccounts?: { subaccount: string }[] }
    return data.subaccounts?.map((s) => s.subaccount) ?? []
  } catch {
    return []
  }
}

// Paginate through ALL subaccounts — parallel page fetches, max 5000 accounts
async function fetchAllSubaccounts(): Promise<string[]> {
  const PAGE = 500
  const MAX_PAGES = 10 // 10 × 500 = 5000 accounts max

  // Fetch first page to know if there's more
  const first = await fetchSubaccountsPage(0, PAGE)
  if (first.length < PAGE) return first // fits in one page

  // Fetch remaining pages in parallel
  const remainingStarts = Array.from({ length: MAX_PAGES - 1 }, (_, i) => (i + 1) * PAGE)
  const pages = await Promise.all(remainingStarts.map((start) => fetchSubaccountsPage(start, PAGE)))

  const all = [first, ...pages].flat()
  // Deduplicate (shouldn't be needed, but safe)
  return [...new Set(all)]
}

interface TickerData {
  product_id: number
  last_price: string
}

async function fetchTickerInfo(productId: number): Promise<{ oraclePrice: number }> {
  try {
    const res = await fetch(`${ARCHIVE_V2}/tickers?market=perp`, {
      headers: { 'Accept-Encoding': 'gzip' },
      next: { revalidate: 60 },
    })
    if (!res.ok) return { oraclePrice: 0 }
    const data = (await res.json()) as Record<string, TickerData>
    const ticker = Object.values(data).find((t) => t.product_id === productId)
    return { oraclePrice: ticker ? parseFloat(ticker.last_price) : 0 }
  } catch {
    return { oraclePrice: 0 }
  }
}

async function fetchMaintWeight(productId: number): Promise<number> {
  // Try to get real maint weight from archive products snapshot
  try {
    const res = await fetch(ARCHIVE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
      body: JSON.stringify({ products: { product_id: productId, limit: 1 } }),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return KNOWN_MAINT_WEIGHTS[productId] ?? 0.95

    const data = (await res.json()) as {
      products?: {
        product?: {
          perp?: { risk?: { long_weight_maintenance_x18?: string } }
        }
      }[]
    }

    const raw = data.products?.[0]?.product?.perp?.risk?.long_weight_maintenance_x18
    if (raw) {
      const w = fromX18(raw)
      if (w > 0) return w
    }
  } catch {
    // fall through
  }
  return KNOWN_MAINT_WEIGHTS[productId] ?? 0.95
}

// Defensive parsing — the archive snapshot response structure may vary
interface RawSnapshot {
  subaccount?: string
  post_balance?: {
    base?:
      | {
          perp?: {
            product_id?: number
            balance?: { amount?: string; v_quote_balance?: string }
          }
        }
      | {
          perp?: {
            product_id?: number
            balance?: { amount?: string; v_quote_balance?: string }
          }
        }[]
  }
}

interface ParsedPosition {
  productId: number
  amount: number
}

function extractPositions(snapshot: RawSnapshot): ParsedPosition[] {
  const base = snapshot.post_balance?.base
  if (!base) return []

  const positions: ParsedPosition[] = []

  // Handle both single-perp and array-of-perps structures
  const perpEntries = Array.isArray((base as { perp?: unknown }).perp)
    ? ((base as { perp: unknown[] }).perp as { product_id?: number; balance?: { amount?: string } }[])
    : (base as { perp?: { product_id?: number; balance?: { amount?: string } } }).perp
      ? [(base as { perp: { product_id?: number; balance?: { amount?: string } } }).perp]
      : []

  for (const perp of perpEntries) {
    if (typeof perp.product_id !== 'number') continue
    const rawAmount = perp.balance?.amount ?? '0'
    const amount = fromX18(rawAmount)
    if (amount !== 0) {
      positions.push({ productId: perp.product_id, amount })
    }
  }

  return positions
}

async function fetchAccountSnapshots(
  subaccounts: string[],
  timestamp: number
): Promise<RawSnapshot[]> {
  if (subaccounts.length === 0) return []
  try {
    const res = await fetch(ARCHIVE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
      body: JSON.stringify({
        account_snapshots: {
          subaccounts,
          timestamps: [timestamp],
          active: true,
        },
      }),
    })
    if (!res.ok) return []
    const data = (await res.json()) as
      | { account_snapshots?: RawSnapshot[] }
      | RawSnapshot[]
    if (Array.isArray(data)) return data
    return data.account_snapshots ?? []
  } catch {
    return []
  }
}

function computeLiquidationPrice(
  oraclePrice: number,
  amount: number,
  maintWeight: number
): number {
  const maintMarginRate = 1 - Math.min(maintWeight, 1)
  const leverage = 10
  if (amount >= 0) {
    // Long: liquidates below entry
    return oraclePrice * (1 - 1 / leverage + maintMarginRate)
  } else {
    // Short: liquidates above entry
    return oraclePrice * (1 + 1 / leverage - maintMarginRate)
  }
}

function computeBucketSize(oraclePrice: number): number {
  if (oraclePrice <= 0) return 100
  return Math.pow(10, Math.floor(Math.log10(oraclePrice / 20)))
}

export async function GET(request: NextRequest): Promise<NextResponse<PredictedLiqResponse>> {
  const { searchParams } = new URL(request.url)
  const rawId = parseInt(searchParams.get('product_id') ?? '0')
  // productId=0 means "All Markets" — default to BTC (2) for oracle price context
  const productId = rawId > 0 ? rawId : 2

  const [subaccounts, { oraclePrice }, maintWeight] = await Promise.all([
    fetchAllSubaccounts(),
    fetchTickerInfo(productId),
    fetchMaintWeight(productId),
  ])

  if (subaccounts.length === 0 || oraclePrice <= 0) {
    return NextResponse.json({
      levels: [],
      oraclePrice,
      productId,
      totalAccountsScanned: subaccounts.length,
      positionsFound: 0,
    })
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const bucketSize = computeBucketSize(oraclePrice)
  const levelMap = new Map<number, { longNotional: number; shortNotional: number }>()
  let positionsFound = 0

  // Split into batches of 100, run ALL in parallel
  const BATCH = 100
  const batches: string[][] = []
  for (let i = 0; i < subaccounts.length; i += BATCH) {
    batches.push(subaccounts.slice(i, i + BATCH))
  }

  const allSnapshots = (
    await Promise.all(batches.map((batch) => fetchAccountSnapshots(batch, timestamp)))
  ).flat()

  for (const snapshot of allSnapshots) {
    const positions = extractPositions(snapshot)
    for (const pos of positions) {
      // Filter by product when a specific one is requested
      if (rawId > 0 && pos.productId !== rawId) continue

      const liqPrice = computeLiquidationPrice(oraclePrice, pos.amount, maintWeight)
      if (liqPrice <= 0) continue

      positionsFound++
      const bucket = Math.floor(liqPrice / bucketSize) * bucketSize
      const existing = levelMap.get(bucket) ?? { longNotional: 0, shortNotional: 0 }
      const notional = Math.abs(pos.amount) * oraclePrice
      if (pos.amount > 0) existing.longNotional += notional
      else existing.shortNotional += notional
      levelMap.set(bucket, existing)
    }
  }

  const levels: PredictedLiqLevel[] = Array.from(levelMap.entries())
    .map(([priceLow, { longNotional, shortNotional }]) => ({
      priceLow,
      priceHigh: priceLow + bucketSize,
      longNotional,
      shortNotional,
    }))
    .sort((a, b) => b.priceLow - a.priceLow)

  return NextResponse.json({
    levels,
    oraclePrice,
    productId,
    totalAccountsScanned: subaccounts.length,
    positionsFound,
  })
}
