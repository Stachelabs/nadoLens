import { NextResponse } from 'next/server'
import { NADO_GATEWAY_REST } from '@/lib/nado'
import { InsuranceFundResponseSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'

export const revalidate = 60

export async function GET(): Promise<NextResponse<{ total: number } | { error: string }>> {
  try {
    const res = await fetch(`${NADO_GATEWAY_REST}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify({ type: 'insurance' }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch insurance fund' }, { status: 502 })
    }

    const raw: unknown = await res.json()
    const parsed = InsuranceFundResponseSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid insurance fund response' }, { status: 502 })
    }

    return NextResponse.json({ total: fromX18BigInt(parsed.data.data.insurance) })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
