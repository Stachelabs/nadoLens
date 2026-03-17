'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useOrderbookStore } from '@/store/orderbookStore'
import { aggregateLevels, computeDepthCurve } from '@/lib/orderbook'

interface Props {
  tickSize: number
}

export function DepthChart({ tickSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rawBids = useOrderbookStore((s) => s.bids)
  const rawAsks = useOrderbookStore((s) => s.asks)

  const points = useMemo(() => {
    const bids = aggregateLevels(rawBids, tickSize).sort((a, b) => b.price - a.price).slice(0, 100)
    const asks = aggregateLevels(rawAsks, tickSize).sort((a, b) => a.price - b.price).slice(0, 100)
    return computeDepthCurve(bids, asks)
  }, [rawBids, rawAsks, tickSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    if (points.length < 2) return

    const prices = points.map((p) => p.price)
    const sizes = points.map((p) => p.cumSize)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const maxSize = Math.max(...sizes)
    if (maxPrice === minPrice || maxSize === 0) return

    const pad = { top: 12, right: 12, bottom: 28, left: 12 }
    const W = width - pad.left - pad.right
    const H = height - pad.top - pad.bottom

    const toX = (price: number) => pad.left + ((price - minPrice) / (maxPrice - minPrice)) * W
    const toY = (size: number) => pad.top + H - (size / maxSize) * H

    const bidPoints = points.filter((p) => p.side === 'bid')
    const askPoints = points.filter((p) => p.side === 'ask')

    // ── Draw bids ──
    if (bidPoints.length > 0) {
      ctx.beginPath()
      ctx.moveTo(toX(bidPoints[0].price), toY(0))
      for (const p of bidPoints) ctx.lineTo(toX(p.price), toY(p.cumSize))
      const lastBid = bidPoints[bidPoints.length - 1]
      ctx.lineTo(toX(lastBid.price), toY(0))
      ctx.closePath()
      const bidGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + H)
      bidGrad.addColorStop(0, 'rgba(52,211,153,0.35)')
      bidGrad.addColorStop(1, 'rgba(52,211,153,0.03)')
      ctx.fillStyle = bidGrad
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(toX(bidPoints[0].price), toY(0))
      for (const p of bidPoints) ctx.lineTo(toX(p.price), toY(p.cumSize))
      ctx.strokeStyle = '#34d399'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // ── Draw asks ──
    if (askPoints.length > 0) {
      ctx.beginPath()
      ctx.moveTo(toX(askPoints[0].price), toY(0))
      for (const p of askPoints) ctx.lineTo(toX(p.price), toY(p.cumSize))
      const lastAsk = askPoints[askPoints.length - 1]
      ctx.lineTo(toX(lastAsk.price), toY(0))
      ctx.closePath()
      const askGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + H)
      askGrad.addColorStop(0, 'rgba(248,113,113,0.35)')
      askGrad.addColorStop(1, 'rgba(248,113,113,0.03)')
      ctx.fillStyle = askGrad
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(toX(askPoints[0].price), toY(0))
      for (const p of askPoints) ctx.lineTo(toX(p.price), toY(p.cumSize))
      ctx.strokeStyle = '#f87171'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // ── Mid-price line ──
    const lastBid = bidPoints[bidPoints.length - 1]?.price
    const firstAsk = askPoints[0]?.price
    if (lastBid && firstAsk) {
      const mid = toX((lastBid + firstAsk) / 2)
      ctx.beginPath()
      ctx.moveTo(mid, pad.top)
      ctx.lineTo(mid, pad.top + H)
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Mid price label
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      const midVal = (lastBid + firstAsk) / 2
      ctx.fillText(midVal.toFixed(1), mid, pad.top + H + 18)
    }

    // ── Price axis labels ──
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(minPrice.toFixed(0), pad.left, pad.top + H + 18)
    ctx.textAlign = 'right'
    ctx.fillText(maxPrice.toFixed(0), pad.left + W, pad.top + H + 18)

  }, [points])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth
        canvas.height = canvas.parentElement.clientHeight
      }
    })
    ro.observe(canvas.parentElement ?? canvas)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2 h-48">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}
