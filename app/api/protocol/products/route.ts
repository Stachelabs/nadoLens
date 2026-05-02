import { NextResponse } from 'next/server'
import { NADO_GATEWAY_REST } from '@/lib/nado'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

type ProductEntry = { product_id: number }

export async function GET(): Promise<NextResponse<{ spot_ids: number[]; perp_ids: number[] } | { error: string }>> {
  try {
    const res = await fetch(`${NADO_GATEWAY_REST}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'edge_all_products' }),
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 502 })
    }

    const raw = await res.json() as { data?: { edge_all_products?: { '57073'?: { spot_products?: ProductEntry[]; perp_products?: ProductEntry[] } } } }
    const chain = raw?.data?.edge_all_products?.['57073']

    const spot_ids = (chain?.spot_products ?? []).map((p) => p.product_id)
    const perp_ids = (chain?.perp_products ?? []).map((p) => p.product_id)

    return NextResponse.json({ spot_ids, perp_ids })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
