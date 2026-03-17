'use client'

import { PAIRS } from '@/lib/orderbook'

interface Props {
  selected: number
  onChange: (productId: number) => void
}

export function PairSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {PAIRS.map((p) => (
        <button
          key={p.productId}
          onClick={() => onChange(p.productId)}
          className={`px-3 py-1.5 rounded text-sm font-mono font-medium transition-colors ${
            selected === p.productId
              ? 'bg-white/15 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
