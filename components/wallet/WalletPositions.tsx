'use client'

import { RefreshCw } from 'lucide-react'
import type { Position } from '@/types/nado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const fmtQty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

type Props = {
  positions: Position[]
  /** Re-fetch Gateway subaccount_info for live marks / unrealized only. */
  onRefreshUnrealized?: () => void | Promise<void>
  unrealizedRefreshing?: boolean
}

export function WalletPositions({
  positions,
  onRefreshUnrealized,
  unrealizedRefreshing = false,
}: Props) {
  if (positions.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">Open Positions</div>
          <div className="text-sm text-muted-foreground/70 text-center py-6">No open positions</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3 min-h-6">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Open Positions <span className="ml-1 text-muted-foreground/50">({positions.length})</span>
          </div>
          {onRefreshUnrealized ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
              disabled={unrealizedRefreshing}
              onClick={() => void onRefreshUnrealized()}
              aria-label="Refresh mark prices and unrealized PnL"
            >
              <RefreshCw className={cn('size-3', unrealizedRefreshing && 'animate-spin')} aria-hidden />
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {['Pair', 'Side', 'Size', 'Avg entry', 'Mark', 'Unrealized PnL', 'Liq Price'].map((h) => (
                  <TableHead key={h} className="font-normal text-muted-foreground/70 pb-2 pr-4">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((pos) => {
                const isLong = pos.amount >= 0
                const pnlColor = pos.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                const nearLiq =
                  pos.liquidation_price > 0 &&
                  Math.abs(pos.mark_price - pos.liquidation_price) / pos.mark_price < 0.1

                return (
                  <TableRow key={pos.product_id} className="border-border/50">
                    <TableCell className="py-2 pr-4 font-mono text-foreground">{pos.pair}</TableCell>
                    <TableCell className="py-2 pr-4">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-bold',
                          isLong
                            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
                            : 'border-red-400/20 bg-red-400/10 text-red-400'
                        )}
                      >
                        {isLong ? 'LONG' : 'SHORT'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {fmtQty.format(Math.abs(pos.amount))}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {fmtUsd.format(pos.entry_price)}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground">
                      {fmtUsd.format(pos.mark_price)}
                    </TableCell>
                    <TableCell className={cn('py-2 pr-4 text-right tabular-nums', pnlColor)}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}{fmtUsd.format(pos.unrealized_pnl)}
                    </TableCell>
                    <TableCell className={cn('py-2 text-right tabular-nums', nearLiq ? 'text-red-400 font-bold' : 'text-muted-foreground')}>
                      {pos.liquidation_price > 0 ? fmtUsd.format(pos.liquidation_price) : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
