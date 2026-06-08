import { NextResponse } from 'next/server'
import { NADO_GATEWAY_V2 } from '@/lib/nado'
import { V2AssetsResponseSchema } from '@/lib/schemas/nado'
import type { V2Asset } from '@/lib/schemas/nado'

export const dynamic = 'force-dynamic'

const FALLBACK: V2Asset[] = [
  // Spot
  { product_id: 0,  symbol: 'USDT0', market_type: null,    ticker_id: null,        name: 'USDT0',              maker_fee: null,   taker_fee: null,    can_withdraw: true,  can_deposit: true  },
  { product_id: 1,  symbol: 'KBTC',  market_type: 'spot',  ticker_id: 'KBTC_USDT0', name: 'Kraken Wrapped BTC', maker_fee: 0.0001, taker_fee: 0.00035, can_withdraw: true,  can_deposit: true  },
  { product_id: 3,  symbol: 'WETH',  market_type: 'spot',  ticker_id: 'WETH_USDT0', name: 'Wrapped ETH',        maker_fee: 0.0001, taker_fee: 0.00035, can_withdraw: true,  can_deposit: true  },
  { product_id: 5,  symbol: 'USDC',  market_type: 'spot',  ticker_id: 'USDC_USDT0', name: 'USDC',               maker_fee: 0.0001, taker_fee: 0.00035, can_withdraw: true,  can_deposit: true  },
  { product_id: 11, symbol: 'NLP',   market_type: 'spot',  ticker_id: 'NLP_USDT0',  name: 'Nado LP',            maker_fee: null,   taker_fee: null,    can_withdraw: true,  can_deposit: true  },
  // Perp (top 3)
  { product_id: 2,  symbol: 'BTC-PERP', market_type: 'perp', ticker_id: 'BTC-PERP_USDT0', name: 'Bitcoin Perp',  maker_fee: 0.0001, taker_fee: 0.00035, can_withdraw: false, can_deposit: false },
  { product_id: 4,  symbol: 'ETH-PERP', market_type: 'perp', ticker_id: 'ETH-PERP_USDT0', name: 'Ethereum Perp', maker_fee: 0.0001, taker_fee: 0.00035, can_withdraw: false, can_deposit: false },
  { product_id: 8,  symbol: 'SOL-PERP', market_type: 'perp', ticker_id: 'SOL-PERP_USDT0', name: 'Solana Perp',   maker_fee: 0.0001, taker_fee: 0.00035, can_withdraw: false, can_deposit: false },
]

export async function GET() {
  try {
    const res = await fetch(`${NADO_GATEWAY_V2}/assets`, {
      headers: { 'Accept-Encoding': 'gzip' },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error('failed')
    const raw: unknown = await res.json()
    const result = V2AssetsResponseSchema.safeParse(raw)
    if (!result.success) throw new Error('invalid')
    return NextResponse.json(result.data)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[api/pairs]', { category: 'fallback', message })
    return NextResponse.json(FALLBACK)
  }
}
