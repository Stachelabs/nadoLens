'use client'

interface Props {
  weight: number
}

export function MaintWeightBadge({ weight }: Props) {
  const isCritical = weight >= 0.95
  const isWarning = weight >= 0.8

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-semibold ${
        isCritical
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
