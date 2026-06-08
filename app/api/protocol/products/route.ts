import { categorizedErrorResponse } from '@/lib/api/apiErrorResponse'
import { withTransientRetry } from '@/lib/api/withTransientRetry'
import { NextResponse } from 'next/server'
import { NADO_GATEWAY_REST } from '@/lib/nado'
import { EdgeAllProductsResponseSchema } from '@/lib/schemas/nado'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

type ProductsResponse = { spot_ids: number[]; perp_ids: number[] }

let lastGoodProducts: ProductsResponse | null = null

function staleFallbackOrError(message: string, status: number): NextResponse<ProductsResponse | { error: string }> {
  if (lastGoodProducts) {
    return NextResponse.json(lastGoodProducts, {
      headers: { 'x-nadolens-fallback': 'stale-products-cache' },
    })
  }
  return NextResponse.json({ error: message }, { status })
}

export async function GET(): Promise<NextResponse<ProductsResponse | { error: string }>> {
  try {
    const res = await withTransientRetry(() =>
      fetch(`${NADO_GATEWAY_REST}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'edge_all_products' }),
        signal: AbortSignal.timeout(10_000),
        next: { revalidate: 3600 },
      }),
    )

    if (!res.ok) {
      return staleFallbackOrError('Failed to fetch products', 502)
    }

    const raw: unknown = await res.json()
    const parsed = EdgeAllProductsResponseSchema.safeParse(raw)

    if (!parsed.success) {
      return staleFallbackOrError('Invalid products response', 502)
    }

    const chain = parsed.data?.data?.edge_all_products?.['57073']
    const spot_ids = (chain?.spot_products ?? []).map((p) => p.product_id)
    const perp_ids = (chain?.perp_products ?? []).map((p) => p.product_id)

    const result: ProductsResponse = { spot_ids, perp_ids }
    lastGoodProducts = result
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[api/protocol/products]', { category: 'fallback', message })
    return staleFallbackOrError('Internal server error', 500)
  }
}
