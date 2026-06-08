import { categorizedErrorResponse } from '@/lib/api/apiErrorResponse'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NADO_ARCHIVE_REST } from '@/lib/nado'
import { MarketSnapshotsResponseSchema, type MarketSnapshot } from '@/lib/schemas/nado'
import { withArchiveRetry } from '@/lib/archiveRetry'

const QuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(200).default(31),
  granularity: z.coerce.number().int().default(86400),
})

export const revalidate = 300

export async function GET(request: NextRequest): Promise<NextResponse<MarketSnapshot[] | { error: string }>> {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }
  const { count, granularity } = parsed.data

  const maxTime = Math.floor(Date.now() / 1000).toString()

  try {
    const res = await withArchiveRetry(() =>
      fetch(NADO_ARCHIVE_REST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip',
        },
        body: JSON.stringify({
          edge_market_snapshots: {
            interval: { count, max_time: maxTime, granularity },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      }),
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch market snapshots' }, { status: 502 })
    }

    const raw: unknown = await res.json()
    const parsed = MarketSnapshotsResponseSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid market snapshots response' }, { status: 502 })
    }

    const snapshots = parsed.data.snapshots['57073'] ?? []
    return NextResponse.json(snapshots)
  } catch (e) {
    return categorizedErrorResponse(e, '[api/protocol/market-snapshots]')
  }
}
