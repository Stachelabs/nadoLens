'use client'

interface Props {
  weight: number
}

export function MaintWeightBadge({ weight }: Props) {
  // weight > 1 = short position — no margin consumed, safe (green)
  // weight < 1 = long position — the closer to 0, the more margin used
  const isShortSafe = weight > 1
  const isCritical = !isShortSafe && weight >= 0.95
  const isWarning = !isShortSafe && weight >= 0.8

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-semibold ${
        isShortSafe
          ? 'bg-emerald-500/10 text-emerald-400/70'
          : isCritical
          ? 'bg-red-500/20 text-red-400 animate-pulse'
          : isWarning
          ? 'bg-orange-500/20 text-orange-400'
          : 'bg-white/8 text-white/40'
      }`}
    >
      {weight.toFixed(3)}
    </span>
  )
}
