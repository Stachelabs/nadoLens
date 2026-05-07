import { type NextRequest, NextResponse } from 'next/server'
import { NADO_ARCHIVE_V2 } from '@/lib/nado'
import { CandlesticksResponseSchema, type Candlestick } from '@/lib/schemas/nado'
import { withArchiveRetry } from '@/lib/archiveRetry'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
): Promise<NextResponse<Candlestick[] | { error: string }>> {
  const { searchParams } = new URL(request.url)
  const productIdStr = searchParams.get('product_id')
  const limitStr = searchParams.get('limit') ?? '30'

  const productId = productIdStr ? parseInt(productIdStr, 10) : NaN
  const limit = parseInt(limitStr, 10)

  if (!Number.isFinite(productId) || productId < 0) {
    return NextResponse.json({ error: 'Invalid product_id' }, { status: 400 })
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: 'Invalid limit' }, { status: 400 })
  }

  try {
    const res = await withArchiveRetry(() =>
      fetch(
        `${NADO_ARCHIVE_V2}/candlesticks?product_id=${productId}&granularity=86400&limit=${limit}`,
        { headers: { 'Accept-Encoding': 'gzip' } },
      ),
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch candlesticks' }, { status: 502 })
    }

    const raw: unknown = await res.json()
    const parsed = CandlesticksResponseSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid candlesticks response' }, { status: 502 })
    }

    return NextResponse.json(parsed.data.candlesticks)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
