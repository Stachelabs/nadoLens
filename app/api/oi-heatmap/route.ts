import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')

  const snapshots = await prisma.oiSnapshot.findMany({
    where: productId ? { product_id: parseInt(productId) } : undefined,
    orderBy: { snapshot_at: 'desc' },
    take: 200,
  })

  return NextResponse.json(snapshots)
}
