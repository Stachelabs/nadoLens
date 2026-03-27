'use client'

import { fromX18 } from '@/types/nado'
import type { TradeMatch } from '@/types/nado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

function fmtTime(nanosStr: string): string {
  const ms = parseInt(nanosStr) / 1_000_000
  if (isNaN(ms)) return '—'
  const d = new Date(ms)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

type Props = {
  trades: TradeMatch[]
}

export function WalletTradeHistory({ trades }: Props) {
  const recent = trades.slice(0, 50)

  if (recent.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">Trade History</div>
          <div className="text-sm text-muted-foreground/70 text-center py-6">No trades found</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">
          Trade History <span className="ml-1 text-muted-foreground/50">(last {recent.length})</span>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {['Time', 'Pair', 'Side', 'Price', 'Qty', 'Realized PnL', 'Fee'].map((h, i) => (
                  <TableHead key={h} className={cn('font-normal text-muted-foreground/70 pb-2 pr-4', i >= 3 ? 'text-right' : '')}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((t, i) => {
                const pnl = fromX18(t.realized_pnl)
                const price = fromX18(t.price)
                const qty = Math.abs(fromX18(t.amount))
                const fee = fromX18(t.fee)
                const hasPnl = Math.abs(pnl) > 0.001
                const pnlColor = pnl >= 0 ? 'text-emerald-400' : 'text-red-400'

                return (
                  <TableRow key={i} className="border-border/50 hover:bg-muted/20">
                    <TableCell className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{fmtTime(t.timestamp)}</TableCell>
                    <TableCell className="py-2 pr-4 font-mono text-foreground/70">{t.pair}</TableCell>
                    <TableCell className="py-2 pr-4">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-bold',
                          t.side === 'long'
                            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
                            : 'border-red-400/20 bg-red-400/10 text-red-400'
                        )}
                      >
                        {t.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">{fmtUsd.format(price)}</TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">{fmtQty.format(qty)}</TableCell>
                    <TableCell className={cn('py-2 pr-4 text-right tabular-nums', hasPnl ? pnlColor : 'text-muted-foreground/70')}>
                      {hasPnl ? `${pnl >= 0 ? '+' : ''}${fmtUsd.format(pnl)}` : '—'}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{fmtUsd.format(fee)}</TableCell>
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
