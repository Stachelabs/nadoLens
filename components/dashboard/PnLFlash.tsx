'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  pnl: number
  className?: string
}

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function PnLFlash({ pnl, className }: Props) {
  const prevPnl = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isFlashing, setIsFlashing] = useState(false)

  useEffect(() => {
    if (prevPnl.current === null) {
      prevPnl.current = pnl
      return
    }

    const prev = prevPnl.current
    if (prev !== 0) {
      const delta = Math.abs((pnl - prev) / prev)
      // Flash if PnL dropped > 5% within the polling interval
      if (delta > 0.05 && pnl < prev) {
        setIsFlashing(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setIsFlashing(false), 30_000)
      }
    }

    prevPnl.current = pnl

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pnl])

  const isPositive = pnl >= 0

  return (
    <span
      className={`tabular-nums font-semibold transition-all duration-300 ${
        isFlashing
          ? 'text-red-400 scale-125 inline-block'
          : isPositive
          ? 'text-emerald-400'
          : 'text-red-400'
      } ${className ?? ''}`}
    >
      {isPositive ? '+' : ''}
      {fmtUsd.format(pnl)}
    </span>
  )
}
