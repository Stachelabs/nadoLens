import { categorizedErrorResponse } from '@/lib/api/apiErrorResponse'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NADO_ARCHIVE_V2 } from '@/lib/nado'
import { CandlesticksResponseSchema, type Candlestick } from '@/lib/schemas/nado'
import { withArchiveRetry } from '@/lib/archiveRetry'

const QuerySchema = z.object({
  product_id: z.coerce.number().int().min(0),
  limit: z.coerce.number().int().min(1).max(500).default(30),
})

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
): Promise<NextResponse<Candlestick[] | { error: string }>> {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid product_id or limit' }, { status: 400 })
  }
  const { product_id: productId, limit } = parsed.data

  try {
    const res = await withArchiveRetry(() =>
      fetch(
        `${NADO_ARCHIVE_V2}/candlesticks?product_id=${productId}&granularity=86400&limit=${limit}`,
        { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(10_000) },
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
  } catch (e) {
    return categorizedErrorResponse(e, '[api/protocol/candlesticks]')
  }
}
