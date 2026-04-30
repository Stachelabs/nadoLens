'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useProtocolFundingRates } from '@/hooks/useProtocolFundingRates'
import { fromX18BigInt } from '@/types/nado'
import type { EnrichedTicker } from '@/lib/schemas/nado'
import type { V2Asset } from '@/lib/schemas/nado'

const fmtUsdFull = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
})

const fmtApr = (v: number) =>
  `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`

function toNum(v: string | number | undefined | null): number {
  return Number(v ?? 0)
}

interface Props {
  tickers: EnrichedTicker[]
  perpAssets: V2Asset[]
}

export function ProtocolTVL({ tickers, perpAssets }: Props) {
  const nlpTicker = tickers.find((t) => t.product_id === 11)

  const perpTickers = tickers.filter((t) => t.market_type === 'perp')
  const perpProductIds = useMemo(
    () =>
      perpAssets.length > 0
        ? perpAssets.map((a) => a.product_id)
        : perpTickers.map((t) => t.product_id),
    [perpAssets, perpTickers],
  )

  const { rates, loading: ratesLoading } = useProtocolFundingRates(perpProductIds)

  const yieldRows = perpTickers
    .map((t) => {
      const entry = rates[String(t.product_id)]
      const rate = entry ? fromX18BigInt(entry.funding_rate_x18) : null
      const apr = rate !== null ? rate * 3 * 365 : null
      return { product_id: t.product_id, symbol: t.symbol, apr }
    })
    .sort((a, b) => {
      if (a.apr === null) return 1
      if (b.apr === null) return -1
      return Math.abs(b.apr) - Math.abs(a.apr)
    })

  return (
    <div className="space-y-8">
      {/* NLP price card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              NLP Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nlpTicker ? (
              <p className="text-2xl font-bold">
                {fmtUsdFull.format(toNum(nlpTicker.last_price))}
              </p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TVL deferred banner */}
      <div className="rounded-md border border-border/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        On-chain TVL data (NLP vault total deposits) will be available in a future update.
      </div>

      {/* Funding yield table */}
      <div>
        <h2 className="mb-3 text-base font-semibold">Funding Yield (Annualized APR)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Annualized at 3 funding periods/day (8h intervals). Positive = longs pay shorts.
        </p>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead className="text-right">Annualized APR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ratesLoading && yieldRows.length === 0
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="w-32 h-4 bg-muted rounded animate-pulse" />
                      <TableCell className="w-20 h-4 bg-muted rounded animate-pulse" />
                    </TableRow>
                  ))
                : yieldRows.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.symbol}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono text-sm',
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
    </div>
  )
}
