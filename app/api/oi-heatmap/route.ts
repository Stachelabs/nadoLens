import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { OIBucket } from '@/types/nado'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')

  const snapshots = await prisma.oiSnapshot.findMany({
    where: productId ? { product_id: parseInt(productId) } : undefined,
    orderBy: { snapshot_at: 'desc' },
    take: 200,
  })

  const buckets: OIBucket[] = snapshots.map((s) => ({
    price_low: Number(s.price_low),
    price_high: Number(s.price_high),
    long_oi_usd: Number(s.long_oi_usd),
    short_oi_usd: Number(s.short_oi_usd),
    risk_score: 0, // recomputed client-side
  }))

  return NextResponse.json(buckets)
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { product_id: number; buckets: OIBucket[] }
  const { product_id, buckets } = body

  if (!Array.isArray(buckets) || buckets.length === 0) {
    return NextResponse.json({ error: 'No buckets provided' }, { status: 400 })
  }

  await prisma.oiSnapshot.createMany({
    data: buckets.map((b) => ({
      product_id,
      price_low: b.price_low,
      price_high: b.price_high,
      long_oi_usd: b.long_oi_usd,
      short_oi_usd: b.short_oi_usd,
    })),
  })

  return NextResponse.json({ inserted: buckets.length })
}
