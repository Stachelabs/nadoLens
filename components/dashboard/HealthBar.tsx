'use client'

import { useAccountStore } from '@/store/accountStore'

function Skeleton() {
  return (
    <div className="space-y-1.5">
      <div className="h-3 w-28 rounded bg-white/5 animate-pulse" />
      <div className="h-4 w-full rounded-full bg-white/5 animate-pulse" />
    </div>
  )
}

export function HealthBar() {
  const health = useAccountStore((s) => s.health)
  if (!health) return <Skeleton />

  const usage = health.maint_margin_usage
  const pct = Math.min(100, usage * 100)
  const isWarning = usage > 0.33
  const isDanger = usage > 0.66

  const fillColor = isDanger
    ? 'bg-red-500'
    : isWarning
    ? 'bg-orange-400'
    : 'bg-emerald-400'

  const textColor = isDanger
    ? 'text-red-400'
    : isWarning
    ? 'text-orange-400'
    : 'text-emerald-400'

  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/40">Margin Usage</span>
        <span className={`font-mono font-bold ${textColor}`}>{pct.toFixed(1)}%</span>
      </div>

      {/* Segmented bar */}
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-white/5">
        {/* Zone backgrounds */}
        <div className="absolute inset-0 flex">
          <div className="h-full flex-1 border-r border-white/10 bg-emerald-500/10" />
          <div className="h-full flex-1 border-r border-white/10 bg-orange-500/10" />
          <div className="h-full flex-1 bg-red-500/10" />
        </div>

        {/* Fill */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${fillColor}`}
          style={{ width: `${pct}%`, opacity: 0.85 }}
        />

        {/* Zone labels */}
        <div className="absolute inset-0 flex text-[8px] font-medium tracking-wider pointer-events-none">
          <div className="flex flex-1 items-center justify-center text-emerald-300/40">SAFE</div>
          <div className="flex flex-1 items-center justify-center text-orange-300/40">WARN</div>
          <div className="flex flex-1 items-center justify-center text-red-300/40">DANGER</div>
        </div>
      </div>

      {/* Thresholds */}
      <div className="flex justify-between text-[9px] text-white/20 px-0.5">
        <span>0%</span>
        <span>33%</span>
        <span>66%</span>
        <span>100%</span>
      </div>
    </div>
  )
}
