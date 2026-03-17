'use client'

import { useEffect, useRef } from 'react'
import { useOrderbookStore } from '@/store/orderbookStore'
import { fromX18 } from '@/types/nado'
import type { OrderbookLevel } from '@/types/nado'

const WS_PROXY_URL = process.env.NEXT_PUBLIC_WS_PROXY_URL ?? 'http://localhost:3001'

interface BookDepthEvent {
  type: 'book_depth'
  product_id: number
  bids: [string, string][]
  asks: [string, string][]
}

function parseLevel(raw: [string, string]): OrderbookLevel {
  return {
    price: fromX18(raw[0]),
    size: fromX18(raw[1]),
  }
}

function isBookDepthEvent(data: Record<string, unknown>): boolean {
  return (
    data.type === 'book_depth' &&
    typeof data.product_id === 'number' &&
    Array.isArray(data.bids) &&
    Array.isArray(data.asks)
  )
}

export function useOrderbookStream(productId: number, pair: string): void {
  const setOrderbook = useOrderbookStore((s) => s.setOrderbook)
  const applyDiff = useOrderbookStore((s) => s.applyDiff)
  const clear = useOrderbookStore((s) => s.clear)

  const sourceRef = useRef<EventSource | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const snapshotLoadedRef = useRef(false)

  // Fetch snapshot on pair change
  useEffect(() => {
    snapshotLoadedRef.current = false
    clear()

    let cancelled = false

    fetch(`/api/orderbook?pair=${pair}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return
        const d = data as { bids?: [number, number][]; asks?: [number, number][] }
        if (!d.bids || !d.asks) return

        // v2 snapshot returns float values (not x18)
        const bids: OrderbookLevel[] = d.bids
          .map(([price, size]) => ({ price, size }))
          .sort((a, b) => b.price - a.price)
        const asks: OrderbookLevel[] = d.asks
          .map(([price, size]) => ({ price, size }))
          .sort((a, b) => a.price - b.price)

        setOrderbook(bids, asks)
        snapshotLoadedRef.current = true
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [pair, setOrderbook, clear])

  // SSE stream for live diffs
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

        if (!isBookDepthEvent(parsed)) return
        const event = parsed as unknown as BookDepthEvent
        if (event.product_id !== productId) return

        const bidUpdates = event.bids.map(parseLevel)
        const askUpdates = event.asks.map(parseLevel)

        applyDiff(bidUpdates, askUpdates)
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
  }, [productId, applyDiff])
}
