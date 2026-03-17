import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const NADO_V2 = process.env.NADO_GATEWAY_V2 ?? 'https://gateway.prod.nado.xyz/v2'

export async function GET(request: NextRequest) {
  const pair = new URL(request.url).searchParams.get('pair')
  if (!pair || !/^[A-Z0-9]+$/.test(pair)) {
    return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
  }

  const res = await fetch(`${NADO_V2}/orderbook?pair=${pair}`, {
    cache: 'no-store',
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Gateway error', status: res.status }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
