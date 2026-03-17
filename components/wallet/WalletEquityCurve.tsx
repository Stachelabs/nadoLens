'use client'

import { useEffect, useRef } from 'react'
import { fromX18 } from '@/types/nado'
import type { TradeMatch } from '@/types/nado'

interface Props {
  trades: TradeMatch[]
}

interface ChartPoint {
  time: import('lightweight-charts').UTCTimestamp
  value: number
}

function buildEquityCurve(trades: TradeMatch[]): ChartPoint[] {
  const sorted = [...trades].sort(
    (a, b) => parseInt(a.timestamp) - parseInt(b.timestamp)
  )

  let cumPnl = 0
  const points: ChartPoint[] = []

  for (const t of sorted) {
    const pnl = fromX18(t.realized_pnl)
    cumPnl += pnl
    const timeSec = Math.floor(parseInt(t.timestamp) / 1_000_000_000)
    if (!isNaN(timeSec) && timeSec > 0) {
      points.push({ time: timeSec as import('lightweight-charts').UTCTimestamp, value: cumPnl })
    }
  }

  return points
}

export function WalletEquityCurve({ trades }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<import('lightweight-charts').IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const points = buildEquityCurve(trades)
    if (points.length < 2) return

    const finalValue = points[points.length - 1]?.value ?? 0
    const lineColor = finalValue >= 0 ? '#34d399' : '#f87171'

    let chart: import('lightweight-charts').IChartApi
    let series: import('lightweight-charts').ISeriesApi<'Line'>

    const init = async () => {
      const lc = await import('lightweight-charts')
      if (!containerRef.current) return

      chart = lc.createChart(containerRef.current, {
        layout: {
          background: { color: 'transparent' },
          textColor: 'rgba(255,255,255,0.4)',
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.05)' },
          horzLines: { color: 'rgba(255,255,255,0.05)' },
        },
        crosshair: {
          vertLine: { color: 'rgba(255,255,255,0.2)' },
          horzLine: { color: 'rgba(255,255,255,0.2)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.1)',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.1)',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: false,
        handleScale: false,
      })

      series = chart.addSeries(lc.LineSeries, {
        color: lineColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      })

      series.setData(points)
      chart.timeScale().fitContent()
      chartRef.current = chart

      const ro = new ResizeObserver(() => {
        if (containerRef.current && chart) {
          chart.applyOptions({ width: containerRef.current.clientWidth })
        }
      })
      ro.observe(containerRef.current)

      return () => {
        ro.disconnect()
        chart.remove()
      }
    }

    const cleanup = init()
    return () => {
      cleanup.then((fn) => fn?.())
    }
  }, [trades])

  const points = buildEquityCurve(trades)
  const finalValue = points[points.length - 1]?.value ?? 0

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-white/30">Equity Curve</div>
        {points.length > 0 && (
          <div className={`text-sm font-bold tabular-nums ${finalValue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {finalValue >= 0 ? '+' : ''}
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(finalValue)}
          </div>
        )}
      </div>
      {points.length < 2 ? (
        <div className="h-48 flex items-center justify-center text-sm text-white/30">
          Not enough trade data to plot curve
        </div>
      ) : (
        <div ref={containerRef} className="h-48 w-full" />
      )}
    </div>
  )
}
