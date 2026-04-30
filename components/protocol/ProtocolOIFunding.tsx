'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useProtocolFundingRates } from '@/hooks/useProtocolFundingRates'
import { fromX18BigInt } from '@/types/nado'
import type { EnrichedTicker, LiquidationFeedEntry } from '@/lib/schemas/nado'
import type { V2Asset } from '@/lib/schemas/nado'

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const fmtPct = (v: number) =>
  `${v >= 0 ? '+' : ''}${(v * 100).toFixed(4)}%`

const fmtApr = (v: number) =>
  `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`

function toNum(v: string | number | undefined): number {
  return Number(v ?? 0)
}

function relativeTime(ts: string | number): string {
  const secs = Math.floor(Date.now() / 1000) - Number(ts)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

interface Props {
  tickers: EnrichedTicker[]
  liquidations: LiquidationFeedEntry[]
  perpAssets: V2Asset[]
}

export function ProtocolOIFunding({ tickers, liquidations, perpAssets }: Props) {
  const perpTickers = tickers.filter((t) => t.market_type === 'perp')
  const sortedByOI = useMemo(
    () => [...perpTickers].sort((a, b) => toNum(b.open_interest_usd ?? b.open_interest) - toNum(a.open_interest_usd ?? a.open_interest)),
    [perpTickers],
  )

  const perpProductIds = useMemo(
    () => (perpAssets.length > 0 ? perpAssets.map((a) => a.product_id) : perpTickers.map((t) => t.product_id)),
    [perpAssets, perpTickers],
  )

  const { rates, loading: ratesLoading } = useProtocolFundingRates(perpProductIds)

  const barData = sortedByOI.map((t) => ({
    symbol: t.symbol,
    oi: toNum(t.open_interest_usd ?? t.open_interest),
  }))

  const fundingRows = sortedByOI.map((t) => {
    const entry = rates[String(t.product_id)]
    const rate = entry ? fromX18BigInt(entry.funding_rate_x18) : null
    const apr = rate !== null ? rate * 3 * 365 : null
    return { product_id: t.product_id, symbol: t.symbol, rate, apr }
  })

  return (
    <div className="space-y-10">
      {/* OI bar chart */}
      <div>
        <h2 className="mb-4 text-base font-semibold">Open Interest by Market</h2>
        {sortedByOI.length === 0 ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, sortedByOI.length * 48)}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => fmtUsd.format(v)}
                tick={{ fontSize: 11 }}
              />
              <YAxis type="category" dataKey="symbol" width={88} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [
                  typeof value === 'number' ? fmtUsd.format(value) : String(value),
                  'Open Interest',
                ]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="oi" fill="var(--warn)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Funding rates table */}
      <div>
        <h2 className="mb-3 text-base font-semibold">Funding Rates</h2>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">8h Rate</TableHead>
                <TableHead className="text-right">Annualized APR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ratesLoading && fundingRows.length === 0
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                : fundingRows.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.symbol}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono text-xs',
                          row.rate === null
                            ? 'text-muted-foreground'
                            : row.rate >= 0
                              ? 'text-primary'
                              : 'text-destructive',
                        )}
                      >
                        {row.rate === null ? '—' : fmtPct(row.rate)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono text-xs',
                          row.apr === null
                            ? 'text-muted-foreground'
                            : row.apr >= 0
                              ? 'text-primary'
                              : 'text-destructive',
                        )}
                      >
                        {row.apr === null ? '—' : fmtApr(row.apr)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Liquidatable accounts */}
      <div>
        <h2 className="mb-3 text-base font-semibold">Liquidatable Accounts</h2>
        {liquidations.length === 0 ? (
          <p className="rounded-md border border-border/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            No accounts currently in liquidation range.
          </p>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subaccount</TableHead>
                  <TableHead className="text-right">Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidations.map((l) => (
                  <TableRow key={l.subaccount}>
                    <TableCell className="font-mono text-xs">
                      {l.subaccount.slice(0, 10)}…{l.subaccount.slice(-6)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {relativeTime(l.update_time)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
