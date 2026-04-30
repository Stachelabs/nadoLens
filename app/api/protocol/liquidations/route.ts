import { NextResponse } from 'next/server'
import { z } from 'zod'
import { NADO_ARCHIVE_REST } from '@/lib/nado'
import { LiquidationFeedEntrySchema, type LiquidationFeedEntry } from '@/lib/schemas/nado'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse<LiquidationFeedEntry[] | { error: string }>> {
  try {
    const res = await fetch(NADO_ARCHIVE_REST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify({ liquidation_feed: {} }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch liquidation feed' }, { status: 502 })
    }

    const raw: unknown = await res.json()
    const parsed = z.array(LiquidationFeedEntrySchema).safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid liquidation feed response' }, { status: 502 })
    }

    return NextResponse.json(parsed.data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
