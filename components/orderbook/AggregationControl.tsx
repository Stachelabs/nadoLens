'use client'

import { TICK_SIZES } from '@/lib/orderbook'

interface Props {
  selected: number
  onChange: (tick: number) => void
}

export function AggregationControl({ selected, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/30">Agg</span>
      <div className="flex gap-1">
        {TICK_SIZES.map((t) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={`px-2 py-1 rounded text-xs tabular-nums transition-colors ${
              selected === t
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            {t < 1 ? t.toFixed(1) : t.toFixed(0)}
          </button>
        ))}
      </div>
    </div>
  )
}
