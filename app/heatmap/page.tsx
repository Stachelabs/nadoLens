'use client'

import { useState, useMemo } from 'react'
import { useLiquidationStream } from '@/hooks/useLiquidationStream'
import { useOIHeatmap } from '@/hooks/useOIHeatmap'
import { useNadoPairs } from '@/hooks/useNadoPairs'
import { usePredictedLiquidations } from '@/hooks/usePredictedLiquidations'
import { useLiquidationStore } from '@/store/liquidationStore'
import { fromX18 } from '@/types/nado'
import type { LiquidationEvent } from '@/types/nado'
import { HeatmapGrid } from '@/components/heatmap/HeatmapGrid'
import { LayerControls } from '@/components/heatmap/LayerControls'
import { ProductSelector } from '@/components/heatmap/ProductSelector'
import { PredictedLiqHeatmap } from '@/components/heatmap/PredictedLiqHeatmap'

function fmtTime(ns: string): string {
  const ms = Math.floor(parseInt(ns) / 1_000_000)
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function fmtUsd(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)
}

function LiqRow({ event }: { event: LiquidationEvent }) {
  const side = event.side ?? (parseFloat(event.amount) >= 0 ? 'long' : 'short')
  const amountUsd = event.amountUsd ?? Math.abs(fromX18(event.amount))
  const priceUsd = event.priceUsd ?? fromX18(event.price)
  const isLong = side === 'long'
  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-1.5 text-xs text-white/40 tabular-nums">{fmtTime(event.timestamp)}</td>
      <td className="px-4 py-1.5 text-xs text-white/60">
        {event.pair ?? `#${event.product_ids[0] ?? '?'}`}
      </td>
      <td className="px-4 py-1.5">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
            isLong
              ? 'bg-red-500/15 text-red-400'
              : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {side.toUpperCase()}
        </span>
      </td>
      <td
        className={`px-4 py-1.5 text-xs tabular-nums font-medium text-right ${
          isLong ? 'text-red-400' : 'text-emerald-400'
        }`}
      >
        {fmtUsd(amountUsd)}
      </td>
      <td className="px-4 py-1.5 text-xs text-white/60 tabular-nums text-right">
        {fmtUsd(priceUsd)}
      </td>
    </tr>
  )
}

export default function HeatmapPage() {
  useLiquidationStream()

  const { pairs } = useNadoPairs()
  const [selectedId, setSelectedId] = useState(0)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showFeed, setShowFeed] = useState(true)
  const [showPredicted, setShowPredicted] = useState(true)

  const { cells, timeStepMs } = useOIHeatmap(selectedId)
  const predData = usePredictedLiquidations(selectedId)
  const allEvents = useLiquidationStore((s) => s.events)

  const filteredEvents = useMemo(
    () => allEvents.filter((e) => e.product_ids.includes(selectedId)),
    [allEvents, selectedId]
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Liquidation Heatmap</h1>
          <p className="mt-0.5 text-xs text-white/40">
            {filteredEvents.length} events · {cells.length} cells
            {selectedId > 0 && allEvents.length !== filteredEvents.length && (
              <span className="ml-1 text-white/20">({allEvents.length} total)</span>
            )}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <ProductSelector pairs={pairs} selectedId={selectedId} onChange={setSelectedId} />
        <LayerControls
          showHeatmap={showHeatmap}
          showFeed={showFeed}
          showPredicted={showPredicted}
          onToggleHeatmap={() => setShowHeatmap((v) => !v)}
          onToggleFeed={() => setShowFeed((v) => !v)}
          onTogglePredicted={() => setShowPredicted((v) => !v)}
          bucketCount={cells.length}
        />
      </div>

      {/* Predicted Liquidations */}
      {showPredicted && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-white/30">
              Estimated Liquidation Levels — Based on {predData.positionsFound} live positions
            </span>
            <span className="text-[10px] text-white/20">
              {predData.totalAccountsScanned} accounts scanned
            </span>
          </div>
          <PredictedLiqHeatmap
            levels={predData.levels}
            oraclePrice={predData.oraclePrice}
            totalAccountsScanned={predData.totalAccountsScanned}
            positionsFound={predData.positionsFound}
            loading={predData.loading}
            height={360}
          />
        </div>
      )}

      {/* 2D Heatmap */}
      {showHeatmap && <HeatmapGrid cells={cells} timeStepMs={timeStepMs} height={380} />}

      {/* Liquidation Feed — filtered by product */}
      {showFeed && (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Time
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Market
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Side
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Size
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-white/20">
                    No liquidations for this market yet…
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event, i) => (
                  <LiqRow key={`${event.timestamp}-${i}`} event={event} />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
