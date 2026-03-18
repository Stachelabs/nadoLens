'use client'

interface LayerControlsProps {
  showHeatmap: boolean
  showFeed: boolean
  showPredicted?: boolean
  onToggleHeatmap: () => void
  onToggleFeed: () => void
  onTogglePredicted?: () => void
  bucketCount: number
}

export function LayerControls({
  showHeatmap,
  showFeed,
  showPredicted = false,
  onToggleHeatmap,
  onToggleFeed,
  onTogglePredicted,
  bucketCount,
}: LayerControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/25 mr-1">Layers</span>

      <button
        onClick={onToggleHeatmap}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          showHeatmap
            ? 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30'
            : 'text-white/30 hover:text-white/50 hover:bg-white/5'
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-sm ${
            showHeatmap ? 'bg-orange-400' : 'bg-white/15'
          }`}
        />
        OI Heatmap
        {bucketCount > 0 && (
          <span className="text-[10px] text-white/30">{bucketCount}</span>
        )}
      </button>

      <button
        onClick={onToggleFeed}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          showFeed
            ? 'bg-white/10 text-white/70 ring-1 ring-white/15'
            : 'text-white/30 hover:text-white/50 hover:bg-white/5'
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-sm ${
            showFeed ? 'bg-red-400' : 'bg-white/15'
          }`}
        />
        Liquidations
      </button>

      {onTogglePredicted && (
        <button
          onClick={onTogglePredicted}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            showPredicted
              ? 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30'
              : 'text-white/30 hover:text-white/50 hover:bg-white/5'
          }`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-sm ${
              showPredicted ? 'bg-yellow-400' : 'bg-white/15'
            }`}
          />
          Predicted Liq
        </button>
      )}
    </div>
  )
}
