'use client'

import { useEffect, useRef } from 'react'
import { useLiquidationStore } from '@/store/liquidationStore'
import { fromX18 } from '@/types/nado'
import type { LiquidationEvent } from '@/types/nado'
import { productName } from '@/hooks/useWalletData'

const WS_PROXY_URL =
  process.env.NEXT_PUBLIC_WS_PROXY_URL ?? 'http://localhost:3001'

function parseLiquidationEvent(data: Record<string, unknown>): LiquidationEvent | null {
  if (
    typeof data.timestamp !== 'string' ||
    !Array.isArray(data.product_ids) ||
    typeof data.liquidator !== 'string' ||
    typeof data.liquidatee !== 'string' ||
    typeof data.amount !== 'string' ||
    typeof data.price !== 'string'
  ) {
    return null
  }
  return {
    type: 'liquidation',
    timestamp: data.timestamp,
    product_ids: data.product_ids as number[],
    liquidator: data.liquidator,
    liquidatee: data.liquidatee,
    amount: data.amount,
    price: data.price,
  }
}

export function useLiquidationStream(): void {
  const addEvent = useLiquidationStore((state) => state.addEvent)
  const setInitialEvents = useLiquidationStore((state) => state.setInitialEvents)
  const sourceRef = useRef<EventSource | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)

  // Load initial data from DB (or Nado archive fallback) on mount
  useEffect(() => {
    fetch('/api/liquidations?limit=200')
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data) && data.length > 0) {
          setInitialEvents(data as LiquidationEvent[])
        }
      })
      .catch(() => {})
  }, [setInitialEvents])

  useEffect(() => {
    function connect() {
      const source = new EventSource(`${WS_PROXY_URL}/sse`)
      sourceRef.current = source

      source.onopen = () => {
        attemptRef.current = 0
      }

      source.onmessage = (e: MessageEvent<string>) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(e.data) as Record<string, unknown>
        } catch {
          return
        }

        if (parsed.type !== 'liquidation') return

        const raw = parseLiquidationEvent(parsed)
        if (!raw) return
        const enriched: LiquidationEvent = {
          ...raw,
          amountUsd: Math.abs(fromX18(raw.amount)),
          priceUsd: fromX18(raw.price),
          side: parseFloat(raw.amount) >= 0 ? 'long' : 'short',
          pair: productName(raw.product_ids[0] ?? 0),
        }

        addEvent(enriched)

        // Persist to DB — fire and forget
        fetch('/api/liquidations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(raw),
        }).catch(() => {})
      }

      source.onerror = () => {
        source.close()
        sourceRef.current = null
        attemptRef.current += 1
        const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000)
        timerRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      sourceRef.current?.close()
      sourceRef.current = null
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [addEvent])
}
