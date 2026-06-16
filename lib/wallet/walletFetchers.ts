import {
  type ArchiveMatch,
  ArchiveMatchesResponseSchema,
  ArchiveSubaccountsResponseSchema,
  IsolatedPositionsDataSchema,
  AccountSnapshotsResponseSchema,
} from '@/lib/schemas/nado'
import { parseSubaccountInfo } from '@/lib/parseSubaccountInfo'
import {
  buildEntryPriceMap,
  type EntryPriceMap,
} from '@/lib/wallet/snapshotEntryPrice'
import { productName } from '@/store/pairsStore'
import {
  normalizeSubaccountDisplayName,
  subaccountDisplayLabelSortKey,
} from '@/lib/wallet/subaccountLabel'
import { isEmptyTrackedSpotBalances } from '@/lib/wallet/spotTracked'
import type {
  CrossSubaccountEntry,
  Position,
  SpotBalance,
  SpotBalancesGroup,
  SubaccountHealthEntry,
  TradeMatch,
} from '@/types/nado'
import { fromX18BigInt } from '@/types/nado'

// ─── Constants ──────────────────────────────────────────────────────────────

export const MATCHES_LIMIT = 250
export const MAX_PAGES = 50
export const MATCHES_BURST_MS = 700

// ─── Types ──────────────────────────────────────────────────────────────────

export type SubaccountEntry = {
  subaccount: string
  isolated: boolean
  subaccount_name?: string
}

export type MatchesPageResult = {
  trades: TradeMatch[]
  nextIdx: string | null
  done: boolean
  rateLimited?: boolean
  serverError?: boolean
}

export type ParsedPositionsResult = {
  positions: Position[]
  spotBalances: SpotBalance[]
  equityUsd: number
  availableMargin: number
  maintenanceMargin: number
  healthScore: number
  unrealizedTotal: number
  failed?: boolean
}

export type FetchAllPositionsResult = ParsedPositionsResult & {
  spotBalancesBySubaccount: SpotBalancesGroup[]
  crossSubaccounts: CrossSubaccountEntry[]
  subaccountHealths: SubaccountHealthEntry[]
  allFailed: boolean
  anyFailed: boolean
}

export type IsolatedParentMaps = {
  parentNameByIsolatedSubaccount: Map<string, string>
  parentSubaccountByIsolatedSubaccount: Map<string, string>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function toSubaccount(address: string): string {
  const addr = address.toLowerCase().replace('0x', '')
  if (addr.length === 64) return `0x${addr}`
  return `0x${addr}64656661756c740000000000`
}

export function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return }
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export function sortTradesNewestFirst(trades: TradeMatch[]): TradeMatch[] {
  return [...trades].sort((a, b) => {
    try {
      const ai = BigInt(a.submission_idx)
      const bi = BigInt(b.submission_idx)
      if (ai > bi) return -1
      if (ai < bi) return 1
      return (a.digest ?? '').localeCompare(b.digest ?? '')
    } catch {
      return b.timestamp.localeCompare(a.timestamp)
    }
  })
}

export function tradeIdentity(trade: TradeMatch): string {
  return [
    trade.submission_idx,
    trade.digest ?? '',
    trade.product_id,
    trade.amount,
    trade.quote_filled ?? '0',
    trade.realized_pnl,
    trade.closed_amount,
    trade.fee,
  ].join(':')
}

// ─── Parsers ────────────────────────────────────────────────────────────────

const PARSE_FALLBACK: ParsedPositionsResult = {
  positions: [],
  spotBalances: [],
  equityUsd: 0,
  availableMargin: 0,
  maintenanceMargin: 0,
  healthScore: 1,
  unrealizedTotal: 0,
}

function parsePositions(raw: unknown, isolated = false): ParsedPositionsResult {
  const parsed = parseSubaccountInfo(raw, isolated)
  if (!parsed) return PARSE_FALLBACK
  return {
    positions: parsed.positions,
    spotBalances: parsed.spotBalances,
    equityUsd: parsed.equityUsd,
    availableMargin: parsed.availableMargin,
    maintenanceMargin: parsed.totalMaintMargin,
    healthScore: parsed.healthScore,
    unrealizedTotal: parsed.unrealizedTotal,
  }
}

export function parseMatchesBatch(
  matches: ArchiveMatch[],
  txMap: Map<string, number>,
): TradeMatch[] {
  return matches.map((m): TradeMatch => {
    const isPerpTrade = !!(
      m.pre_balance?.base?.perp?.product_id !== undefined
        ? m.pre_balance.base.perp.product_id
        : m.post_balance?.base?.perp?.product_id
    )
    const productId =
      m.pre_balance?.base?.perp?.product_id ??
      m.post_balance?.base?.perp?.product_id ??
      0
    const side: 'long' | 'short' =
      BigInt(m.base_filled ?? '0') >= BigInt(0) ? 'long' : 'short'
    const timeSec = txMap.get(m.submission_idx) ?? 0

    const timestampStr =
      timeSec > 0
        ? (BigInt(timeSec) * BigInt(1_000_000_000)).toString()
        : '0'

    const WAD_LOCAL = BigInt(10) ** BigInt(18)
    let priceX18Str: string
    try {
      const baseB = BigInt(m.base_filled ?? '0')
      if (baseB !== BigInt(0) && m.quote_filled) {
        const quoteB = BigInt(m.quote_filled)
        const feeB = BigInt(m.fee ?? '0')
        const absBase = baseB < BigInt(0) ? -baseB : baseB
        const signedNotional = quoteB + feeB
        const absSignedNotional =
          signedNotional < BigInt(0) ? -signedNotional : signedNotional
        priceX18Str = ((absSignedNotional * WAD_LOCAL) / absBase).toString()
      } else {
        priceX18Str = m.order?.priceX18 ?? '0'
      }
    } catch {
      priceX18Str = m.order?.priceX18 ?? '0'
    }

    return {
      digest: m.digest,
      subaccount: m.order?.sender,
      is_taker: m.is_taker,
      isolated: m.isolated,
      timestamp: timestampStr,
      submission_idx: m.submission_idx,
      product_id: productId,
      pair: productName(productId),
      amount: m.base_filled ?? '0',
      price: priceX18Str,
      quote_filled: m.quote_filled ?? '0',
      realized_pnl: m.realized_pnl ?? '0',
      closed_amount: m.closed_amount ?? '0',
      fee: m.fee ?? '0',
      sequencer_fee: m.sequencer_fee ?? '0',
      side,
      is_perp: isPerpTrade,
      pre_balance_amount:
        m.pre_balance?.base?.perp?.balance?.amount ?? undefined,
    }
  })
}

// ─── Fetchers ───────────────────────────────────────────────────────────────

export async function fetchSubaccounts(
  address: string,
  signal?: AbortSignal,
): Promise<SubaccountEntry[]> {
  const fallback: SubaccountEntry[] = [
    { subaccount: toSubaccount(address), isolated: false, subaccount_name: 'default' },
  ]
  try {
    const res = await fetch(`/api/subaccounts/${address}`, {
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return fallback
    const raw: unknown = await res.json()
    const result = ArchiveSubaccountsResponseSchema.safeParse(raw)
    if (!result.success || result.data.subaccounts.length === 0) return fallback
    return result.data.subaccounts.map((s) => ({
      subaccount: s.subaccount,
      isolated: s.isolated ?? false,
      subaccount_name: s.subaccount_name,
    }))
  } catch {
    return fallback
  }
}

export async function fetchIsolatedParentMaps(
  subs: SubaccountEntry[],
  signal?: AbortSignal,
): Promise<IsolatedParentMaps> {
  const parentNameByIsolatedSubaccount = new Map<string, string>()
  const parentSubaccountByIsolatedSubaccount = new Map<string, string>()
  const crossSubs = subs.filter((s) => !s.isolated)
  for (const c of crossSubs) {
    try {
      const res = await fetch(
        `/api/wallet/${c.subaccount}?query=isolated_positions`,
        { cache: 'no-store', signal },
      )
      if (!res.ok) continue
      const raw: unknown = await res.json()
      const parsed = IsolatedPositionsDataSchema.safeParse(raw)
      if (!parsed.success) continue
      for (const iso of parsed.data.isolated_positions) {
        parentNameByIsolatedSubaccount.set(
          iso.subaccount.toLowerCase(),
          c.subaccount_name ?? 'default',
        )
        parentSubaccountByIsolatedSubaccount.set(
          iso.subaccount.toLowerCase(),
          c.subaccount,
        )
      }
    } catch {
      // best effort
    }
  }
  return { parentNameByIsolatedSubaccount, parentSubaccountByIsolatedSubaccount }
}

export async function fetchSnapshotEntryPrices(
  crossSubaccounts: string[],
  signal?: AbortSignal,
): Promise<EntryPriceMap> {
  if (crossSubaccounts.length === 0) return new Map()
  try {
    const res = await fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subaccounts: crossSubaccounts }),
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return new Map()
    const raw: unknown = await res.json()
    const parsed = AccountSnapshotsResponseSchema.safeParse(raw)
    if (!parsed.success) return new Map()
    return buildEntryPriceMap(parsed.data.snapshots)
  } catch {
    return new Map()
  }
}

const FETCH_FAILED: ParsedPositionsResult = {
  ...PARSE_FALLBACK,
  failed: true,
}

export async function fetchPositions(
  sub: string,
  isolated: boolean,
  signal?: AbortSignal,
): Promise<ParsedPositionsResult> {
  try {
    const res = await fetch(`/api/wallet/${sub}?query=subaccount_info`, {
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return FETCH_FAILED
    const raw: unknown = await res.json()
    return parsePositions(raw, isolated)
  } catch {
    return FETCH_FAILED
  }
}

export async function fetchAllPositions(
  subs: SubaccountEntry[],
  isolatedParentNameBySubaccount: Map<string, string>,
  isolatedParentSubaccountBySubaccount: Map<string, string>,
  signal?: AbortSignal,
): Promise<FetchAllPositionsResult> {
  const results = await Promise.all(
    subs.map(({ subaccount, isolated }) =>
      fetchPositions(subaccount, isolated, signal),
    ),
  )
  const allFailed =
    results.length > 0 && results.every((r) => r.failed === true)
  const anyFailed = results.some((r) => r.failed === true)
  const subNameBySubaccount = new Map(
    subs.map((s) => [s.subaccount.toLowerCase(), s.subaccount_name ?? 'default']),
  )
  const allPositions = results
    .flatMap((r) => r.positions)
    .map((p) => ({
      ...p,
      subaccount_name:
        subNameBySubaccount.get(p.subaccount.toLowerCase()) ??
        p.subaccount_name ??
        'default',
      parent_subaccount_name: p.isolated
        ? isolatedParentNameBySubaccount.get(p.subaccount.toLowerCase())
        : undefined,
      parent_subaccount: p.isolated
        ? isolatedParentSubaccountBySubaccount.get(p.subaccount.toLowerCase())
        : undefined,
    }))

  const spotMap = new Map<number, SpotBalance>()
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i]
    if (!sub || sub.isolated) continue
    const balances = results[i]?.spotBalances ?? []
    if (isEmptyTrackedSpotBalances(balances)) continue
    for (const b of balances) {
      const existing = spotMap.get(b.product_id)
      if (existing) {
        spotMap.set(b.product_id, {
          ...existing,
          amount: existing.amount + b.amount,
          value_usd: existing.value_usd + b.value_usd,
        })
      } else {
        spotMap.set(b.product_id, { ...b })
      }
    }
  }
  const spotBalances = Array.from(spotMap.values())

  const spotBalancesBySubaccount: SpotBalancesGroup[] = subs
    .map((s, i) => ({
      s,
      balances: results[i]?.spotBalances ?? [],
    }))
    .filter(
      ({ s, balances }) =>
        !s.isolated && !isEmptyTrackedSpotBalances(balances),
    )
    .map(({ s, balances }) => ({
      label: normalizeSubaccountDisplayName(s.subaccount_name),
      subaccount: s.subaccount,
      balances,
    }))
    .sort(
      (a, b) =>
        subaccountDisplayLabelSortKey(a.label) -
        subaccountDisplayLabelSortKey(b.label),
    )

  const crossSubaccounts: CrossSubaccountEntry[] = subs
    .filter((s) => !s.isolated)
    .map((s) => ({
      subaccount: s.subaccount,
      label: normalizeSubaccountDisplayName(s.subaccount_name),
    }))
    .sort(
      (a, b) =>
        subaccountDisplayLabelSortKey(a.label) -
        subaccountDisplayLabelSortKey(b.label),
    )

  const equityUsd = results.reduce((s, r) => s + r.equityUsd, 0)
  const availableMargin = results.reduce((s, r) => s + r.availableMargin, 0)
  const maintenanceMargin = results.reduce((s, r) => s + r.maintenanceMargin, 0)
  const primaryIdx = subs.findIndex((s) => !s.isolated)
  const healthScore =
    results[primaryIdx >= 0 ? primaryIdx : 0]?.healthScore ?? 1
  const unrealizedTotal = results.reduce((s, r) => s + r.unrealizedTotal, 0)

  const subaccountHealths: SubaccountHealthEntry[] = subs
    .flatMap((sub, i): SubaccountHealthEntry[] => {
      const r = results[i]
      if (!r) return []
      if (r.equityUsd === 0 && r.positions.length === 0) return []
      const entry: SubaccountHealthEntry = {
        subaccount: sub.subaccount,
        subaccount_name: normalizeSubaccountDisplayName(sub.subaccount_name),
        health_score: r.healthScore,
        isolated: sub.isolated,
      }
      if (sub.isolated && r.positions[0]?.pair) {
        entry.pair = r.positions[0].pair
      }
      return [entry]
    })

  return {
    positions: allPositions,
    spotBalances,
    spotBalancesBySubaccount,
    crossSubaccounts,
    equityUsd,
    availableMargin,
    maintenanceMargin,
    healthScore,
    unrealizedTotal,
    subaccountHealths,
    allFailed,
    anyFailed,
  }
}

export async function fetchOnePage(
  subs: string[],
  signal?: AbortSignal,
  lastIdx?: string,
  productIds?: number[],
  noCache?: boolean,
): Promise<MatchesPageResult> {
  const isPositionScoped = productIds && productIds.length > 0
  const route = isPositionScoped ? '/api/positions_matches' : '/api/global_matches'
  const body: Record<string, unknown> = {
    subaccounts: subs,
    isolated: null,
    limit: MATCHES_LIMIT,
    ...(lastIdx ? { idx: lastIdx } : {}),
    ...(isPositionScoped ? { product_ids: productIds } : {}),
    ...(noCache ? { no_cache: true } : {}),
  }

  try {
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal,
    })

    if (res.status === 429) {
      return { trades: [], nextIdx: lastIdx ?? null, done: false, rateLimited: true }
    }

    if (res.status >= 500) {
      return { trades: [], nextIdx: lastIdx ?? null, done: false, serverError: true }
    }

    if (!res.ok) {
      return { trades: [], nextIdx: null, done: true }
    }

    const raw: unknown = await res.json()
    const result = ArchiveMatchesResponseSchema.safeParse(raw)
    if (!result.success || result.data.matches.length === 0) {
      return { trades: [], nextIdx: null, done: true }
    }

    const pageMatches = result.data.matches
    const txMap = new Map<string, number>()
    for (const tx of result.data.txs) {
      txMap.set(tx.submission_idx, parseInt(tx.timestamp, 10))
    }
    const trades = parseMatchesBatch(pageMatches, txMap)
    const done = pageMatches.length < MATCHES_LIMIT
    const nextIdx = done
      ? null
      : pageMatches[pageMatches.length - 1].submission_idx
    return { trades, nextIdx, done }
  } catch {
    return { trades: [], nextIdx: lastIdx ?? null, done: false, serverError: true }
  }
}

// ─── Position-scoped match prefetch ────────────────────────────────────────

export type PositionMatchesPrefetchResult = {
  positionTrades: TradeMatch[]
  positionOpenTimeMap: Record<string, number>
}

const MAX_POSITION_SCOPED_PAGES = 5

export async function prefetchPositionMatches(
  positions: Position[],
  signal: AbortSignal,
  burstMs: number,
): Promise<PositionMatchesPrefetchResult> {
  const positionTrades: TradeMatch[] = []
  const positionOpenTimeMap: Record<string, number> = {}
  const seenIds = new Set<string>()

  type PairKey = {
    pocketSubaccount: string
    querySubaccount: string
    productId: number
    isIsolated: boolean
  }

  const pairs: PairKey[] = positions
    .filter(p => fromX18BigInt(p.amount_x18) !== 0)
    .map(p => ({
      pocketSubaccount: p.subaccount,
      querySubaccount: p.isolated
        ? (p.parent_subaccount ?? p.subaccount)
        : p.subaccount,
      productId: p.product_id,
      isIsolated: p.isolated,
    }))

  if (pairs.length === 0) return { positionTrades, positionOpenTimeMap }

  const completedProducts = new Set<string>()
  const cursorByPair: Record<string, string | undefined> = {}

  let iteration = 0
  while (completedProducts.size < pairs.length && iteration < MAX_POSITION_SCOPED_PAGES) {
    if (signal.aborted) break
    for (const pair of pairs) {
      if (signal.aborted) break
      const pairKey = `${pair.pocketSubaccount}:${pair.productId}`
      if (completedProducts.has(pairKey)) continue

      const result = await fetchOnePage(
        [pair.querySubaccount],
        signal,
        cursorByPair[pairKey],
        [pair.productId],
      )

      if (result.rateLimited || result.serverError || result.trades.length === 0) {
        completedProducts.add(pairKey)
        continue
      }

      for (const trade of result.trades) {
        const tradeId = `${trade.submission_idx ?? ""}-${trade.subaccount ?? ""}-${trade.product_id}`
        if (seenIds.has(tradeId)) continue
        seenIds.add(tradeId)
        positionTrades.push(trade)

        if ((trade.isolated ?? false) !== pair.isIsolated) continue
        if (trade.pre_balance_amount === undefined) continue

        const preBalance = fromX18BigInt(trade.pre_balance_amount)
        if (Math.abs(preBalance) < 1e-10) {
          const timeSec = trade.timestamp
            ? Number(BigInt(trade.timestamp) / BigInt(1_000_000_000))
            : 0
          positionOpenTimeMap[pairKey] = timeSec
          completedProducts.add(pairKey)
          break
        }
      }

      if (!completedProducts.has(pairKey)) {
        if (result.done) {
          completedProducts.add(pairKey)
        } else {
          cursorByPair[pairKey] = result.nextIdx ?? undefined
        }
      }

      await sleep(burstMs, signal)
    }
    iteration++
  }

  return { positionTrades, positionOpenTimeMap }
}
