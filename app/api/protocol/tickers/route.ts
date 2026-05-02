import { NextResponse } from 'next/server'
import { NADO_ARCHIVE_V2, NADO_GATEWAY_V2 } from '@/lib/nado'
import {
  TickersResponseSchema,
  V2AssetsResponseSchema,
  EnrichedTickersResponseSchema,
  type EnrichedTicker,
} from '@/lib/schemas/nado'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse<EnrichedTicker[] | { error: string }>> {
  try {
    const [tickersRes, assetsRes] = await Promise.all([
      fetch(`${NADO_ARCHIVE_V2}/contracts`, {
        headers: { 'Accept-Encoding': 'gzip' },
      }),
      fetch(`${NADO_GATEWAY_V2}/assets`, {
        headers: { 'Accept-Encoding': 'gzip' },
        next: { revalidate: 3600 },
      }),
    ])

    if (!tickersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch tickers' }, { status: 502 })
    }
    if (!assetsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 502 })
    }

    const [tickersRaw, assetsRaw] = await Promise.all([tickersRes.json(), assetsRes.json()])

    const tickersParsed = TickersResponseSchema.safeParse(tickersRaw)
    const assetsParsed = V2AssetsResponseSchema.safeParse(assetsRaw)

    if (!tickersParsed.success) {
      return NextResponse.json({ error: 'Invalid tickers response' }, { status: 502 })
    }
    if (!assetsParsed.success) {
      return NextResponse.json({ error: 'Invalid assets response' }, { status: 502 })
    }

    const assetsByProductId = new Map(assetsParsed.data.map((a) => [a.product_id, a]))

    const enriched: EnrichedTicker[] = Object.values(tickersParsed.data).map((ticker) => {
      const asset = assetsByProductId.get(ticker.product_id)
      const marketType = asset?.market_type ?? (ticker.product_type === 'perpetual' ? 'perp' : null)
      return {
        ...ticker,
        symbol: asset?.symbol ?? ticker.base_currency ?? ticker.ticker_id,
        maker_fee: asset?.maker_fee != null ? Number(asset.maker_fee) : null,
        taker_fee: asset?.taker_fee != null ? Number(asset.taker_fee) : null,
        market_type: marketType,
      }
    })

    const parsed = EnrichedTickersResponseSchema.safeParse(enriched)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enrichment schema mismatch' }, { status: 502 })
    }

    return NextResponse.json(parsed.data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
