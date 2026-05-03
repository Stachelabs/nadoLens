import { type NextRequest, NextResponse } from 'next/server'
import { NADO_ARCHIVE_REST } from '@/lib/nado'
import { FundingRatesResponseSchema, type FundingRateEntry } from '@/lib/schemas/nado'

export const revalidate = 60

export async function GET(
  request: NextRequest,
): Promise<NextResponse<Record<string, FundingRateEntry> | { error: string }>> {
  const { searchParams } = new URL(request.url)
  const productIdsStr = searchParams.get('product_ids')

  if (!productIdsStr) {
    return NextResponse.json({ error: 'product_ids is required' }, { status: 400 })
  }

  const productIds = productIdsStr.split(',').map((s) => parseInt(s.trim(), 10))

  if (productIds.some((id) => !Number.isFinite(id) || id < 0)) {
    return NextResponse.json({ error: 'Invalid product_ids' }, { status: 400 })
  }

  try {
    const res = await fetch(NADO_ARCHIVE_REST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify({ funding_rates: { product_ids: productIds } }),
    })

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
