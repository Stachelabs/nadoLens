import { NextResponse } from 'next/server'
import { NADO_ARCHIVE_V2, NADO_GATEWAY_V2 } from '@/lib/nado'
import {
  TickersResponseSchema,
  V2AssetsResponseSchema,
  EnrichedTickersResponseSchema,
  type TickerData,
  type V2Asset,
  type EnrichedTicker,
} from '@/lib/schemas/nado'

type TickerApiResponse = EnrichedTicker[] | { error: string }

const TICKERS_REVALIDATE_SECONDS = 300
let lastGoodTickers: EnrichedTicker[] | null = null

function enrichTickers(
  tickers: Record<string, TickerData>,
  assets: V2Asset[] | null,
): EnrichedTicker[] {
  const assetsByProductId = new Map(assets?.map((a) => [a.product_id, a]) ?? [])
  const contractProductIds = new Set(Object.values(tickers).map((t) => t.product_id))

  const enriched: EnrichedTicker[] = Object.values(tickers).map((ticker) => {
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

  // Spot-only assets from /v2/assets that have no matching contract entry
  if (assets) {
    for (const asset of assets) {
      if (contractProductIds.has(asset.product_id)) continue
      enriched.push({
        product_id: asset.product_id,
        ticker_id: asset.ticker_id ?? asset.symbol,
        last_price: 0,
        symbol: asset.symbol,
        maker_fee: asset.maker_fee != null ? Number(asset.maker_fee) : null,
        taker_fee: asset.taker_fee != null ? Number(asset.taker_fee) : null,
        market_type: asset.market_type ?? 'spot',
      })
    }
  }

  return enriched
}

export async function GET(): Promise<NextResponse<TickerApiResponse>> {
  try {
    const [tickersRes, assetsRes] = await Promise.allSettled([
      fetch(`${NADO_ARCHIVE_V2}/contracts`, {
        headers: { 'Accept-Encoding': 'gzip' },
        next: { revalidate: TICKERS_REVALIDATE_SECONDS },
      }),
      fetch(`${NADO_GATEWAY_V2}/assets`, {
        headers: { 'Accept-Encoding': 'gzip' },
        next: { revalidate: TICKERS_REVALIDATE_SECONDS },
      }),
    ])

    if (tickersRes.status === 'rejected' || !tickersRes.value.ok) {
      if (lastGoodTickers) {
        return NextResponse.json(lastGoodTickers, {
          headers: { 'x-nadolens-fallback': 'stale-tickers-cache' },
        })
      }
      return NextResponse.json({ error: 'Failed to fetch tickers' }, { status: 502 })
    }

    const tickersRaw = (await tickersRes.value.json()) as unknown
    const assetsRaw =
      assetsRes.status === 'fulfilled' && assetsRes.value.ok
        ? ((await assetsRes.value.json()) as unknown)
        : null

    const tickersParsed = TickersResponseSchema.safeParse(tickersRaw)
    if (!tickersParsed.success) {
      if (lastGoodTickers) {
        return NextResponse.json(lastGoodTickers, {
          headers: { 'x-nadolens-fallback': 'stale-tickers-cache' },
        })
      }
      return NextResponse.json({ error: 'Invalid tickers response' }, { status: 502 })
    }

    const assetsParsed = assetsRaw ? V2AssetsResponseSchema.safeParse(assetsRaw) : null
    const enriched = enrichTickers(
      tickersParsed.data,
      assetsParsed?.success ? assetsParsed.data : null,
    )

    const parsed = EnrichedTickersResponseSchema.safeParse(enriched)
    if (!parsed.success) {
      if (lastGoodTickers) {
        return NextResponse.json(lastGoodTickers, {
          headers: { 'x-nadolens-fallback': 'stale-tickers-cache' },
        })
      }
      return NextResponse.json({ error: 'Enrichment schema mismatch' }, { status: 502 })
    }

    lastGoodTickers = parsed.data
    return NextResponse.json(parsed.data)
  } catch {
    if (lastGoodTickers) {
      return NextResponse.json(lastGoodTickers, {
        headers: { 'x-nadolens-fallback': 'stale-tickers-cache' },
      })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
