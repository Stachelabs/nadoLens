'use client'

import { useEffect, useRef } from 'react'
import type { OIBucket } from '@/types/nado'

interface HeatmapChartProps {
  buckets: OIBucket[]
  height?: number
  maxRows?: number
}

function riskColor(score: number, alpha = 1): string {
  if (score < 0.33) {
    const t = score / 0.33
    const r = Math.round(30 + t * 80)
    const g = Math.round(60 + t * 40)
    const b = Math.round(200 + t * 20)
    return `rgba(${r},${g},${b},${alpha})`
  }
  if (score < 0.66) {
    const t = (score - 0.33) / 0.33
    const r = Math.round(110 + t * 120)
    const g = Math.round(100 - t * 40)
    const b = Math.round(220 - t * 160)
    return `rgba(${r},${g},${b},${alpha})`
  }
  const t = (score - 0.66) / 0.34
  const r = Math.round(230 + t * 9)
  const g = Math.round(60 - t * 40)
  const b = Math.round(60 - t * 30)
  return `rgba(${r},${g},${b},${alpha})`
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export function HeatmapChart({ buckets, height = 320, maxRows = 30 }: HeatmapChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || buckets.length === 0) return

    const draw = () => {
      const dpr = window.devicePixelRatio ?? 1
      const w = container.clientWidth
      const h = height

      canvas.width = w * dpr
      canvas.height = h * dpr

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      const padLeft = 76
      const padRight = 72
      const padTop = 8
      const padBottom = 8
      const chartW = w - padLeft - padRight
      const chartH = h - padTop - padBottom

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0)'
      ctx.clearRect(0, 0, w, h)

      const display = buckets.slice(0, maxRows)
      const rowH = chartH / display.length

      display.forEach((bucket, i) => {
        const y = padTop + i * rowH
        const total = bucket.long_oi_usd + bucket.short_oi_usd

        // Row hover-zone background
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0)'
        ctx.fillRect(0, y, w, rowH)

        if (total > 0) {
          // Full bar (heat color)
          const barW = Math.max(4, chartW * bucket.risk_score)
          ctx.fillStyle = riskColor(bucket.risk_score, 0.5)
          ctx.fillRect(padLeft, y + 1, barW, rowH - 2)

          // Long portion (red) / Short portion (green)
          const longW = barW * (bucket.long_oi_usd / total)
          if (longW > 1) {
            ctx.fillStyle = 'rgba(239,68,68,0.35)'
            ctx.fillRect(padLeft, y + 1, longW, rowH - 2)
          }
          if (barW - longW > 1) {
            ctx.fillStyle = 'rgba(52,211,153,0.35)'
            ctx.fillRect(padLeft + longW, y + 1, barW - longW, rowH - 2)
          }

          // Left edge accent
          ctx.fillStyle = riskColor(bucket.risk_score, 0.9)
          ctx.fillRect(padLeft, y + 1, 2, rowH - 2)
        }

        // Price label (left)
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = `${Math.max(9, Math.min(11, rowH - 2))}px monospace`
        ctx.textAlign = 'right'
        ctx.fillText(`$${bucket.price_low.toLocaleString()}`, padLeft - 5, y + rowH / 2 + 3.5)

        // Value label (right)
        if (bucket.risk_score > 0.05 && total > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          ctx.font = `${Math.max(8, Math.min(10, rowH - 3))}px monospace`
          ctx.textAlign = 'left'
          ctx.fillText(fmtUsd(total), padLeft + chartW + 5, y + rowH / 2 + 3.5)
        }
      })

      // Grid lines (vertical)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let i = 1; i <= 4; i++) {
        const x = padLeft + (chartW / 4) * i
        ctx.beginPath()
        ctx.moveTo(x, padTop)
        ctx.lineTo(x, padTop + chartH)
        ctx.stroke()
      }

      // Legend: Long / Short
      const legendY = padTop + chartH + 4
      ctx.fillStyle = 'rgba(239,68,68,0.7)'
      ctx.fillRect(padLeft, legendY, 8, 5)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('LONG liq.', padLeft + 10, legendY + 5)

      ctx.fillStyle = 'rgba(52,211,153,0.7)'
      ctx.fillRect(padLeft + 68, legendY, 8, 5)
      ctx.fillText('SHORT liq.', padLeft + 78, legendY + 5)
    }

    draw()

    const ro = new ResizeObserver(draw)
    ro.observe(container)
    return () => ro.disconnect()
  }, [buckets, height, maxRows])

  if (buckets.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-white/10 bg-black/20 text-sm text-white/20"
        style={{ height }}
      >
        Collecting liquidation data…
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full rounded-lg overflow-hidden border border-white/10 bg-black/20">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  )
}
