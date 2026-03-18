'use client'

import { useEffect, useRef } from 'react'
import type { PredictedLiqLevel } from '@/app/api/predicted-liquidations/route'

interface Props {
  levels: PredictedLiqLevel[]
  oraclePrice: number
  height?: number
  totalAccountsScanned?: number
  positionsFound?: number
  loading?: boolean
}

function fmtPrice(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

function fmtNotional(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

export function PredictedLiqHeatmap({
  levels,
  oraclePrice,
  height = 360,
  totalAccountsScanned = 0,
  positionsFound = 0,
  loading = false,
}: Props) {
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

      if (loading) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.font = '13px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`Scanning ${totalAccountsScanned} traders…`, w / 2, h / 2)
        return
      }

      if (levels.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.font = '13px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('No open positions found for this market', w / 2, h / 2)
        return
      }

      const PAD_LEFT = 72
      const PAD_RIGHT = 72
      const PAD_TOP = 16
      const PAD_BOTTOM = 16
      const gridW = w - PAD_LEFT - PAD_RIGHT
      const gridH = h - PAD_TOP - PAD_BOTTOM

      const sortedLevels = [...levels].sort((a, b) => a.priceLow - b.priceLow)

      const minPrice = sortedLevels[0].priceLow
      const maxPrice = sortedLevels[sortedLevels.length - 1].priceLow

      const priceRange = maxPrice - minPrice
      const priceBuffer = priceRange * 0.1
      const displayMin = minPrice - priceBuffer
      const displayMax = maxPrice + priceBuffer

      const maxNotional = Math.max(
        ...levels.map((l) => Math.max(l.longNotional, l.shortNotional)),
        1
      )
      const maxBarWidth = gridW * 0.85

      const oraclePriceY =
        PAD_TOP + gridH - ((oraclePrice - displayMin) / (displayMax - displayMin)) * gridH

      ctx.strokeStyle = 'rgba(255, 255, 200, 0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT, oraclePriceY)
      ctx.lineTo(w - PAD_RIGHT, oraclePriceY)
      ctx.stroke()

      ctx.fillStyle = 'rgba(255, 255, 200, 0.9)'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(fmtPrice(oraclePrice), PAD_LEFT + 4, oraclePriceY - 4)

      for (const level of levels) {
        const isAboveOracle = level.priceLow > oraclePrice
        const barHeight = 8

        const priceCenter = level.priceLow + (level.priceHigh - level.priceLow) / 2
        const y =
          PAD_TOP + gridH - ((priceCenter - displayMin) / (displayMax - displayMin)) * gridH

        if (level.longNotional > 0) {
          const width = (level.longNotional / maxNotional) * maxBarWidth
          const barStartX = w / 2 - width

          const alpha = 0.15 + (Math.log1p(level.longNotional) / Math.log1p(maxNotional)) * 0.7
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`
          ctx.fillRect(barStartX, y - barHeight / 2, width, barHeight)

          if (width > 60 && level.longNotional > maxNotional * 0.05) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'
            ctx.font = '9px monospace'
            ctx.textAlign = 'right'
            ctx.fillText(fmtNotional(level.longNotional), barStartX - 4, y + 3)
          }
        }

        if (level.shortNotional > 0) {
          const width = (level.shortNotional / maxNotional) * maxBarWidth
          const barStartX = w / 2

          const alpha = 0.15 + (Math.log1p(level.shortNotional) / Math.log1p(maxNotional)) * 0.7
          ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`
          ctx.fillRect(barStartX, y - barHeight / 2, width, barHeight)

          if (width > 60 && level.shortNotional > maxNotional * 0.05) {
            ctx.fillStyle = 'rgba(52, 211, 153, 0.9)'
            ctx.font = '9px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(fmtNotional(level.shortNotional), barStartX + width + 4, y + 3)
          }
        }
      }

      const tickCount = Math.max(5, Math.floor(gridH / 40))
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'

      for (let i = 0; i <= tickCount; i++) {
        const t = i / tickCount
        const price = displayMin + t * (displayMax - displayMin)
        const y = PAD_TOP + gridH - t * gridH

        ctx.fillText(fmtPrice(price), PAD_LEFT - 6, y + 3)

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD_LEFT, y)
        ctx.lineTo(w - PAD_RIGHT, y)
        ctx.stroke()
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
      ctx.strokeRect(PAD_LEFT, PAD_TOP, gridW, gridH)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(container)
    return () => ro.disconnect()
  }, [levels, oraclePrice, height, loading, totalAccountsScanned])

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
