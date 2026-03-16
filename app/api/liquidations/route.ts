import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { LiquidationEvent } from '@/types/nado'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  const rows = await prisma.liquidation.findMany({
    where: productId ? { product_id: parseInt(productId) } : undefined,
    orderBy: { timestamp: 'desc' },
    take: limit,
  })

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LiquidationEvent

  const productId = body.product_ids[0] ?? 0

  const record = await prisma.liquidation.createMany({
    data: {
      timestamp: BigInt(body.timestamp),
      product_id: productId,
      amount: body.amount,
      price: body.price,
      liquidator: body.liquidator,
      liquidatee: body.liquidatee,
    },
    skipDuplicates: true,
  })

  return NextResponse.json(record, { status: 201 })
}
