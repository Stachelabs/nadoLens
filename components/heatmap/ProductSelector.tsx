'use client'

import type { NadoPair } from '@/hooks/useNadoPairs'

interface Props {
  pairs: NadoPair[]
  selectedId: number
  onChange: (id: number) => void
}

export function ProductSelector({ pairs, selectedId, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-white/30">Market</span>
      <select
        value={selectedId}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 outline-none focus:border-white/20 focus:bg-white/8 cursor-pointer"
      >
        <option value={0} className="bg-zinc-900 text-white">All Markets</option>
        {pairs.map((p) => (
          <option
            key={p.product_id}
            value={p.product_id}
            className="bg-zinc-900 text-white"
          >
            {p.symbol} — {p.pair}
          </option>
        ))}
      </select>
    </div>
  )
}
