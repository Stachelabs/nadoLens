import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Liquidation } from '@prisma/client'
import type { LiquidationEvent } from '@/types/nado'

export const dynamic = 'force-dynamic'

const ARCHIVE_URL = process.env.NADO_ARCHIVE_REST ?? 'https://archive.prod.nado.xyz/indexer'

// Nado archive event shape (liquidate_subaccount)
interface ArchiveLiqEvent {
  subaccount: string
  product_id: number
  submission_idx: string
  pre_balance: { perp?: { balance: { amount: string; v_quote_balance: string } } }
  post_balance: { perp?: { balance: { amount: string; v_quote_balance: string } } }
  product: { perp?: { oracle_price_x18: string } }
}

async function fetchFromArchive(limit: number): Promise<LiquidationEvent[]> {
  const res = await fetch(ARCHIVE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
    body: JSON.stringify({ events: { event_types: ['liquidate_subaccount'] } }),
    next: { revalidate: 60 },
  })

  if (!res.ok) return []

  const data = (await res.json()) as { events: ArchiveLiqEvent[] }
  const events = data.events ?? []

  // Estimate timestamps from submission_idx (relative to newest)
  const maxIdx = Math.max(...events.map((e) => parseInt(e.submission_idx)), 0)
  // Use seconds to avoid BigInt — nanoseconds would overflow Number.MAX_SAFE_INTEGER
  const nowSec = Math.floor(Date.now() / 1000)

  return events
    .filter((e) => {
      const preAmt = e.pre_balance.perp?.balance.amount ?? '0'
      const postAmt = e.post_balance.perp?.balance.amount ?? '0'
      return preAmt !== postAmt || preAmt !== '0'
    })
    .slice(0, limit)
    .map((e): LiquidationEvent => {
      const preAmt = e.pre_balance.perp?.balance.amount ?? '0'
      const postAmt = e.post_balance.perp?.balance.amount ?? '0'
      // liquidated amount = pre - post (float approximation — x18 values too large for safe int)
      const preNum = parseFloat(preAmt)
      const postNum = parseFloat(postAmt)
      const liquidatedAmt = (preNum - postNum).toFixed(0)
      const price = e.product.perp?.oracle_price_x18 ?? '0'

      // Estimate timestamp in nanoseconds (Ink L2 ≈ 2s blocks)
      const idxDiff = maxIdx - parseInt(e.submission_idx)
      const estimatedSec = nowSec - idxDiff * 2
      const estimatedNs = (estimatedSec * 1e9).toFixed(0)

      return {
        type: 'liquidation',
        timestamp: estimatedNs,
        product_ids: [e.product_id],
        liquidator: '0x0000000000000000000000000000000000000000',
        liquidatee: e.subaccount,
        amount: liquidatedAmt,
        price,
        priceUsd: parseFloat(price) / 1e18,
        amountUsd: Math.abs(parseFloat(liquidatedAmt) / 1e18) * (parseFloat(price) / 1e18),
        side: parseFloat(liquidatedAmt) >= 0 ? 'long' : 'short',
      }
    })
    .filter((e) => e.amountUsd && e.amountUsd > 0)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500)

  const rows = await prisma.liquidation.findMany({
    where: productId ? { product_id: parseInt(productId) } : undefined,
    orderBy: { timestamp: 'desc' },
    take: limit,
  })

  if (rows.length > 0) {
    const events: LiquidationEvent[] = rows.map((r: Liquidation) => ({
      type: 'liquidation',
      timestamp: r.timestamp.toString(),
      product_ids: [r.product_id],
      liquidator: r.liquidator,
      liquidatee: r.liquidatee,
      amount: r.amount.toString(),
      price: r.price.toString(),
      priceUsd: parseFloat(r.price.toString()) / 1e18,
      amountUsd: Math.abs(parseFloat(r.amount.toString()) / 1e18),
      side: parseFloat(r.amount.toString()) >= 0 ? 'long' : 'short',
    }))
    return NextResponse.json(events)
  }

  // DB empty — fallback to Nado archive
  const archiveEvents = await fetchFromArchive(limit)
  return NextResponse.json(archiveEvents)
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LiquidationEvent

  const productId = body.product_ids[0] ?? 0

  const record = await prisma.liquidation.createMany({
    data: [
      {
        timestamp: BigInt(body.timestamp),
        product_id: productId,
        amount: body.amount,
        price: body.price,
        liquidator: body.liquidator,
        liquidatee: body.liquidatee,
      },
    ],
    skipDuplicates: true,
  })

  return NextResponse.json(record, { status: 201 })
}
