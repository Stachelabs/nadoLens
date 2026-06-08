import { categorizedErrorResponse } from '@/lib/api/apiErrorResponse'
import { withTransientRetry } from '@/lib/api/withTransientRetry'
import { NextResponse } from 'next/server'
import { NADO_GATEWAY_REST } from '@/lib/nado'
import { InsuranceFundResponseSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'

export const revalidate = 60

type InsuranceResponse = { total: number }

let lastGoodInsurance: InsuranceResponse | null = null

function staleFallbackOrError(message: string, status: number): NextResponse<InsuranceResponse | { error: string }> {
  if (lastGoodInsurance) {
    return NextResponse.json(lastGoodInsurance, {
      headers: { 'x-nadolens-fallback': 'stale-insurance-cache' },
    })
  }
  return NextResponse.json({ error: message }, { status })
}

export async function GET(): Promise<NextResponse<InsuranceResponse | { error: string }>> {
  try {
    const res = await withTransientRetry(() =>
      fetch(`${NADO_GATEWAY_REST}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip',
        },
        body: JSON.stringify({ type: 'insurance' }),
        signal: AbortSignal.timeout(10_000),
      }),
    )

    if (!res.ok) {
      return staleFallbackOrError('Failed to fetch insurance fund', 502)
    }

    const raw: unknown = await res.json()
    const parsed = InsuranceFundResponseSchema.safeParse(raw)

    if (!parsed.success) {
      return staleFallbackOrError('Invalid insurance fund response', 502)
    }

    const result: InsuranceResponse = { total: fromX18BigInt(parsed.data.data.insurance) }
    lastGoodInsurance = result
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[api/protocol/insurance-fund]', { category: 'fallback', message })
    return staleFallbackOrError('Internal server error', 500)
  }
}
