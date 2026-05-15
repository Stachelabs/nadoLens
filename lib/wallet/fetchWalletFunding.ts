import { InterestAndFundingPaymentsResponseSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'
import { nanoStringToUnixSec } from '@/lib/wallet/nanoTime'
import type { FundingPaymentEntry } from '@/lib/wallet/buildEquityCurve'

const FUNDING_BURST_MS = 220
const FUNDING_LIMIT = 100
const FUNDING_MAX_PAGES = 100

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type FundingFetchResult = {
  totalFundingUsd: number
  payments: FundingPaymentEntry[]
  complete: boolean
  rateLimited?: boolean
  nextMaxIdx?: string | null
}

export async function fetchFundingBySubaccount(
  subaccount: string,
  productIds: number[],
  options?: { stopBeforeMs?: number; resumeFromIdx?: string | null },
  signal?: AbortSignal,
): Promise<FundingFetchResult> {
  if (productIds.length === 0) {
    return { totalFundingUsd: 0, payments: [], complete: true, nextMaxIdx: null }
  }
  if (options?.resumeFromIdx === null) {
    return { totalFundingUsd: 0, payments: [], complete: true, nextMaxIdx: null }
  }

  let page = 0
  let maxIdx: string | undefined = options?.resumeFromIdx ?? undefined
  let totalFundingUsd = 0
  const seen = new Set<string>()
  const payments: FundingPaymentEntry[] = []
  let complete = true
  let nextMaxIdx: string | null = null

  while (page < FUNDING_MAX_PAGES) {
    if (signal?.aborted) break
    page += 1

    const body: Record<string, unknown> = {
      subaccount,
      product_ids: productIds,
      limit: FUNDING_LIMIT,
      ...(maxIdx ? { max_idx: maxIdx } : {}),
    }

    const res = await fetch('/api/funding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal,
    })

    if (res.status === 429) {
      return { totalFundingUsd, payments, complete: false, rateLimited: true, nextMaxIdx: maxIdx ?? null }
    }
    if (!res.ok) {
      complete = false
      break
    }

    const raw: unknown = await res.json()
    const result = InterestAndFundingPaymentsResponseSchema.safeParse(raw)
    if (!result.success) {
      complete = false
      break
    }

    for (const payment of result.data.funding_payments) {
      const key = `funding:${subaccount}:${payment.idx}:${payment.product_id}:${payment.amount}:${payment.timestamp}`
      if (seen.has(key)) continue
      seen.add(key)
      totalFundingUsd += fromX18BigInt(payment.amount)
      payments.push({
        subaccount,
        product_id: payment.product_id,
        idx: payment.idx,
        timestamp: payment.timestamp,
        amount: payment.amount,
        source: 'funding',
      })
    }

    const pageNextIdx = result.data.next_idx
    if (pageNextIdx === null || pageNextIdx === undefined) {
      nextMaxIdx = null
      break
    }
    maxIdx = String(pageNextIdx)

    if (options?.stopBeforeMs !== undefined) {
      const lastTs = result.data.funding_payments.at(-1)?.timestamp
      if (lastTs) {
        const lastSec = nanoStringToUnixSec(lastTs)
        if (lastSec !== null && lastSec * 1000 <= options.stopBeforeMs) {
          nextMaxIdx = maxIdx
          break
        }
      }
    }

    await sleep(FUNDING_BURST_MS)
  }

  if (page >= FUNDING_MAX_PAGES) {
    complete = false
    nextMaxIdx = maxIdx ?? null
  }

  return { totalFundingUsd, payments, complete, nextMaxIdx }
}

export async function fetchFundingAllSubaccounts(
  subs: string[],
  productIds: number[],
  signal?: AbortSignal,
): Promise<FundingFetchResult> {
  if (subs.length === 0 || productIds.length === 0) {
    return { totalFundingUsd: 0, payments: [], complete: true }
  }

  let totalFundingUsd = 0
  const payments: FundingPaymentEntry[] = []
  let complete = true

  for (let i = 0; i < subs.length; i++) {
    if (signal?.aborted) break
    const subaccount = subs[i]!
    const result = await fetchFundingBySubaccount(subaccount, productIds, undefined, signal)
    totalFundingUsd += result.totalFundingUsd
    payments.push(...result.payments)
    if (!result.complete) complete = false
    if (result.rateLimited) {
      return { totalFundingUsd, payments, complete: false, rateLimited: true }
    }
    if (i < subs.length - 1) await sleep(FUNDING_BURST_MS)
  }

  return { totalFundingUsd, payments, complete }
}

export type PositionFundingParams = {
  subaccountsWithPerps: string[]
  openPerpProductIds: number[]
  openTimeKeyByQueryKey: Map<string, string>
  positionOpenTimeMap: Record<string, number>
}

export async function fetchPositionScopedFunding(
  params: PositionFundingParams,
  signal?: AbortSignal,
): Promise<FundingPaymentEntry[]> {
  const { subaccountsWithPerps, openPerpProductIds, openTimeKeyByQueryKey, positionOpenTimeMap } = params

  if (openPerpProductIds.length === 0) return []

  const accumulated: FundingPaymentEntry[] = []

  for (const subaccount of subaccountsWithPerps) {
    if (signal?.aborted) break
    const completedProducts = new Set<number>()
    let nextIdx: string | undefined = undefined

    for (let page = 0; page < FUNDING_MAX_PAGES; page++) {
      if (signal?.aborted) break
      if (completedProducts.size >= openPerpProductIds.length) break

      const activeProductIds = openPerpProductIds.filter(id => !completedProducts.has(id))
      if (activeProductIds.length === 0) break

      const res = await fetch('/api/funding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subaccount,
          product_ids: activeProductIds,
          limit: FUNDING_LIMIT,
          ...(nextIdx !== undefined ? { max_idx: nextIdx } : {}),
        }),
        cache: 'no-store',
        signal,
      })

      if (!res || !res.ok) break

      const raw: unknown = await res.json()
      const result = InterestAndFundingPaymentsResponseSchema.safeParse(raw)
      if (!result.success) break

      for (const payment of result.data.funding_payments) {
        const queryKey = `${subaccount}:${payment.product_id}`
        const openTimeKey = openTimeKeyByQueryKey.get(queryKey) ?? queryKey
        const openTime = positionOpenTimeMap[openTimeKey] ?? 0

        const paymentTimeSec = nanoStringToUnixSec(payment.timestamp) ?? 0
        if (paymentTimeSec <= openTime) {
          completedProducts.add(payment.product_id)
          continue
        }

        accumulated.push({
          subaccount,
          product_id: payment.product_id,
          idx: payment.idx,
          timestamp: payment.timestamp,
          amount: payment.amount,
          source: 'funding',
        })
      }

      const responseNextIdx = result.data.next_idx
      if (responseNextIdx === null || responseNextIdx === undefined) break
      nextIdx = String(responseNextIdx)

      if (completedProducts.size >= openPerpProductIds.length) break

      await sleep(FUNDING_BURST_MS)
    }
  }

  return accumulated
}
