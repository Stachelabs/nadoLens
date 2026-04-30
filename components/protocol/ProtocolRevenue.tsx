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
import type { EnrichedTicker } from '@/lib/schemas/nado'
import type { V2Asset } from '@/lib/schemas/nado'

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const fmtUsdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
})

const fmtPct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

function toNum(v: string | number | undefined | null): number {
  return Number(v ?? 0)
}

interface Props {
  tickers: EnrichedTicker[]
  perpAssets: V2Asset[]
}

export function ProtocolRevenue({ tickers, perpAssets }: Props) {
  const perpTickers = tickers.filter((t) => t.market_type === 'perp')

  const rows = useMemo(
    () =>
      perpTickers
        .map((t) => {
          const volume = toNum(t.quote_volume)
          const takerFee = toNum(t.taker_fee)
          const estFees = volume * takerFee
          return { ticker: t, volume, takerFee, estFees }
        })
        .sort((a, b) => b.estFees - a.estFees),
    [perpTickers],
  )

  const totalVolume = rows.reduce((acc, r) => acc + r.volume, 0)
  const totalFees = rows.reduce((acc, r) => acc + r.estFees, 0)

  const feeRates = perpAssets.length > 0 ? perpAssets : perpTickers.map((t) => ({
    product_id: t.product_id,
    symbol: t.symbol,
    maker_fee: t.maker_fee,
    taker_fee: t.taker_fee,
  }))

  return (
    <div className="space-y-8">
      {/* Summary card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Est. 24h Protocol Fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtUsdCompact.format(totalFees)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              24h Total Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtUsdCompact.format(totalVolume)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Disclaimer */}
      <p className="rounded-md border border-border/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Estimated fees are based on taker volume × taker fee rate. Actual protocol revenue may differ.
      </p>

      {/* Per-product breakdown */}
      <div>
        <h2 className="mb-3 text-base font-semibold">Fee Breakdown by Market</h2>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">24h Volume</TableHead>
                <TableHead className="text-right">Taker Fee</TableHead>
                <TableHead className="text-right">Est. Fees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ ticker, volume, takerFee, estFees }) => (
                <TableRow key={ticker.product_id}>
                  <TableCell className="font-medium">{ticker.symbol}</TableCell>
                  <TableCell className="text-right">{fmtUsdCompact.format(volume)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {takerFee > 0 ? fmtPct.format(takerFee) : '—'}
                  </TableCell>
                  <TableCell className="text-right">{fmtUsd.format(estFees)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Fee rate table */}
      <div>
        <h2 className="mb-3 text-base font-semibold">Fee Rates</h2>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Maker</TableHead>
                <TableHead className="text-right">Taker</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeRates.map((a) => (
                <TableRow key={a.product_id}>
                  <TableCell className="font-medium">{a.symbol}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {a.maker_fee != null ? fmtPct.format(toNum(a.maker_fee)) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {a.taker_fee != null ? fmtPct.format(toNum(a.taker_fee)) : '—'}
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
