import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const NADO_GATEWAY = process.env.NADO_GATEWAY_REST ?? 'https://gateway.prod.nado.xyz/v1'

interface Props {
  params: Promise<{ address: string }>
}

export async function GET(request: NextRequest, { params }: Props) {
  const { address } = await params
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') ?? 'subaccount_info'

  const body = {
    type: query,
    subaccount: address,
  }

  const response = await fetch(`${NADO_GATEWAY}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Gateway request failed', status: response.status },
      { status: response.status },
    )
  }

  const data = await response.json()
  return NextResponse.json(data)
}
