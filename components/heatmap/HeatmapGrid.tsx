'use client'

import { useEffect, useRef } from 'react'
import type { HeatmapCell } from '@/hooks/useOIHeatmap'

interface Props {
  cells: HeatmapCell[]
  timeStepMs: number
  height?: number
}

// Plasma-like colormap: 0=deep blue, 0.5=orange, 1=yellow
function plasmaColor(t: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [13, 8, 135],
    [126, 3, 168],
    [240, 75, 91],
    [252, 166, 54],
    [240, 249, 33],
  ]
  const idx = t * (stops.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, stops.length - 1)
  const f = idx - lo
  const [r1, g1, b1] = stops[lo]
  const [r2, g2, b2] = stops[hi]
  return [
    Math.round(r1 + f * (r2 - r1)),
    Math.round(g1 + f * (g2 - g1)),
    Math.round(b1 + f * (b2 - b1)),
  ]
}

function fmtTime(ms: number, stepMs: number): string {
  const d = new Date(ms)
  if (stepMs >= 86400_000) return `${d.getMonth() + 1}/${d.getDate()}`
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtPrice(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

export function HeatmapGrid({ cells, timeStepMs, height = 380 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const draw = () => {
      const dpr = window.devicePixelRatio ?? 1
      const w = container.clientWidth
      const h = height

      canvas.width = w * dpr
      canvas.height = h * dpr

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      if (cells.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.font = '13px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('Collecting liquidation data for this market…', w / 2, h / 2)
        return
      }

      const PAD_LEFT = 64
      const PAD_RIGHT = 12
      const PAD_TOP = 10
      const PAD_BOTTOM = 28
      const gridW = w - PAD_LEFT - PAD_RIGHT
      const gridH = h - PAD_TOP - PAD_BOTTOM

      // Determine axes
      const times = [...new Set(cells.map((c) => c.timeMs))].sort((a, b) => a - b)
      const prices = [...new Set(cells.map((c) => c.priceLow))].sort((a, b) => a - b)

      const numCols = times.length
      const numRows = prices.length
      if (numCols === 0 || numRows === 0) return

      const cellW = gridW / numCols
      const cellH = gridH / numRows

      const timeIdx = new Map(times.map((t, i) => [t, i]))
      const priceIdx = new Map(prices.map((p, i) => [p, numRows - 1 - i]))

      // Draw cells
      for (const cell of cells) {
        const col = timeIdx.get(cell.timeMs) ?? 0
        const row = priceIdx.get(cell.priceLow) ?? 0

        const x = PAD_LEFT + col * cellW
        const y = PAD_TOP + row * cellH

        if (cell.intensity < 0.01) continue

        const [r, g, b] = plasmaColor(cell.intensity)
        const alpha = 0.15 + cell.intensity * 0.85
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.fillRect(x + 0.5, y + 0.5, Math.max(cellW - 1, 1), Math.max(cellH - 1, 1))

        // Long/short tint overlay (subtle)
        const total = cell.longUsd + cell.shortUsd
        if (total > 0 && cell.intensity > 0.1) {
          const longRatio = cell.longUsd / total
          if (longRatio > 0.6) {
            ctx.fillStyle = `rgba(239,68,68,${cell.intensity * 0.25})`
            ctx.fillRect(x + 0.5, y + 0.5, Math.max(cellW - 1, 1), Math.max(cellH - 1, 1))
          } else if (longRatio < 0.4) {
            ctx.fillStyle = `rgba(52,211,153,${cell.intensity * 0.25})`
            ctx.fillRect(x + 0.5, y + 0.5, Math.max(cellW - 1, 1), Math.max(cellH - 1, 1))
          }
        }
      }

      // Price axis labels (left)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'
      const priceStep = Math.max(1, Math.floor(numRows / 8))
      prices.forEach((price, i) => {
        if (i % priceStep !== 0 && i !== prices.length - 1) return
        const row = priceIdx.get(price) ?? 0
        const y = PAD_TOP + row * cellH + cellH / 2 + 3.5
        ctx.fillText(fmtPrice(price), PAD_LEFT - 4, y)
      })

      // Time axis labels (bottom)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      const timeStepCount = Math.max(1, Math.floor(numCols / 6))
      times.forEach((t, i) => {
        if (i % timeStepCount !== 0 && i !== times.length - 1) return
        const col = timeIdx.get(t) ?? 0
        const x = PAD_LEFT + col * cellW + cellW / 2
        ctx.fillText(fmtTime(t, timeStepMs), x, h - 8)
      })

      // Grid border
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.strokeRect(PAD_LEFT, PAD_TOP, gridW, gridH)

      // Colorbar legend (top-right)
      const cbX = w - PAD_RIGHT - 80
      const cbY = PAD_TOP
      const cbW = 70
      const cbH = 6
      const grad = ctx.createLinearGradient(cbX, 0, cbX + cbW, 0)
      grad.addColorStop(0, 'rgba(13,8,135,0.9)')
      grad.addColorStop(0.25, 'rgba(126,3,168,0.9)')
      grad.addColorStop(0.5, 'rgba(240,75,91,0.9)')
      grad.addColorStop(0.75, 'rgba(252,166,54,0.9)')
      grad.addColorStop(1, 'rgba(240,249,33,0.9)')
      ctx.fillStyle = grad
      ctx.fillRect(cbX, cbY, cbW, cbH)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '8px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('Low', cbX, cbY + cbH + 9)
      ctx.textAlign = 'right'
      ctx.fillText('High', cbX + cbW, cbY + cbH + 9)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(container)
    return () => ro.disconnect()
  }, [cells, timeStepMs, height])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-white/10 bg-black/30"
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  )
}
