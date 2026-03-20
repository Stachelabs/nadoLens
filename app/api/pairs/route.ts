import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch('https://gateway.prod.nado.xyz/v2/pairs', {
      headers: { 'Accept-Encoding': 'gzip' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error('failed')
    const data: unknown = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([
      { product_id: 2, pair: 'BTCUSDT0', symbol: 'BTC' },
      { product_id: 4, pair: 'ETHUSDT0', symbol: 'ETH' },
      { product_id: 8, pair: 'SOLUSDT0', symbol: 'SOL' },
      { product_id: 10, pair: 'ARBUSDT0', symbol: 'ARB' },
      { product_id: 14, pair: 'BNBUSDT0', symbol: 'BNB' },
      { product_id: 16, pair: 'AVAXUSDT0', symbol: 'AVAX' },
      { product_id: 18, pair: 'OPUSDT0', symbol: 'OP' },
      { product_id: 20, pair: 'MATICUSDT0', symbol: 'MATIC' },
      { product_id: 22, pair: 'DOGEUSDT0', symbol: 'DOGE' },
      { product_id: 24, pair: 'LINKUSDT0', symbol: 'LINK' },
    ])
  }
}
