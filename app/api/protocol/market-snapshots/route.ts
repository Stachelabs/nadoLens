import { NextRequest, NextResponse } from 'next/server'
import { NADO_ARCHIVE_REST } from '@/lib/nado'
import { MarketSnapshotsResponseSchema, type MarketSnapshot } from '@/lib/schemas/nado'
import { withArchiveRetry } from '@/lib/archiveRetry'

export const revalidate = 300

export async function GET(request: NextRequest): Promise<NextResponse<MarketSnapshot[] | { error: string }>> {
  const params = request.nextUrl.searchParams
  const count = Math.min(Math.max(1, Number(params.get('count') ?? 31)), 100)
  const granularity = Number(params.get('granularity') ?? 86400)

  if (!Number.isInteger(count) || !Number.isInteger(granularity)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
