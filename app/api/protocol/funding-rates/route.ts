import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NADO_ARCHIVE_REST } from '@/lib/nado'
import { FundingRatesResponseSchema, type FundingRateEntry } from '@/lib/schemas/nado'
import { withArchiveRetry } from '@/lib/archiveRetry'

const QuerySchema = z.object({
  product_ids: z.string().transform(s => s.split(',').map(Number)).pipe(z.array(z.number().int().min(0))),
})

export const revalidate = 60

export async function GET(
  request: NextRequest,
): Promise<NextResponse<Record<string, FundingRateEntry> | { error: string }>> {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'product_ids is required and must be valid integers' }, { status: 400 })
  }
  const productIds = parsed.data.product_ids

  try {
    const res = await withArchiveRetry(() =>
      fetch(NADO_ARCHIVE_REST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip',
        },
        body: JSON.stringify({ funding_rates: { product_ids: productIds } }),
      }),
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch funding rates' }, { status: 502 })
    }

    const raw: unknown = await res.json()
    const parsed = FundingRatesResponseSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid funding rates response' }, { status: 502 })
    }

    return NextResponse.json(parsed.data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
