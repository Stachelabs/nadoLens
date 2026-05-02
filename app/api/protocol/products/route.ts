import { z } from 'zod'
import { NextResponse } from 'next/server'
import { NADO_GATEWAY_REST } from '@/lib/nado'
import { AllProductsDataSchema } from '@/lib/schemas/nado'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

const EdgeAllProductsResponseSchema = z.object({
  data: z.object({
    edge_all_products: z.record(z.string(), AllProductsDataSchema).optional(),
  }).optional(),
})

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

    const raw: unknown = await res.json()
    const parsed = EdgeAllProductsResponseSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid products response' }, { status: 502 })
    }

    const chain = parsed.data?.data?.edge_all_products?.['57073']
    const spot_ids = (chain?.spot_products ?? []).map((p) => p.product_id)
    const perp_ids = (chain?.perp_products ?? []).map((p) => p.product_id)

    return NextResponse.json({ spot_ids, perp_ids })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
