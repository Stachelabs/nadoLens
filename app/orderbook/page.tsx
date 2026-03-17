'use client'

import { useState } from 'react'
import { PAIRS } from '@/lib/orderbook'
import { useOrderbookStream } from '@/hooks/useOrderbookStream'
import { PairSelector } from '@/components/orderbook/PairSelector'
import { AggregationControl } from '@/components/orderbook/AggregationControl'
import { SpreadBadge } from '@/components/orderbook/SpreadBadge'
import { DepthChart } from '@/components/orderbook/DepthChart'
import { OrderbookTable } from '@/components/orderbook/OrderbookTable'

export default function OrderbookPage() {
  const [productId, setProductId] = useState(2) // BTC default
  const [tickSize, setTickSize] = useState(1)

  const selectedPair = PAIRS.find((p) => p.productId === productId) ?? PAIRS[0]

  useOrderbookStream(productId, selectedPair.pair)

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <PairSelector selected={productId} onChange={(id) => { setProductId(id); setTickSize(1) }} />
          <AggregationControl selected={tickSize} onChange={setTickSize} />
        </div>
        <SpreadBadge />
      </div>

      {/* Depth chart */}
      <DepthChart tickSize={tickSize} />

      {/* Orderbook table */}
      <OrderbookTable tickSize={tickSize} maxRows={20} />
    </div>
  )
}
