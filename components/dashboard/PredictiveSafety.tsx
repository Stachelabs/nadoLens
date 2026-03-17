'use client'

import { useAccountStore } from '@/store/accountStore'

export function PredictiveSafety() {
  const health = useAccountStore((s) => s.health)

  if (!health) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Drop Tolerance</div>
        <div className="h-8 w-20 rounded bg-white/5 animate-pulse" />
      </div>
    )
  }

  const dropTol = health.drop_tolerance
  const isCritical = dropTol < 10
  const isWarning = dropTol < 25

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isCritical
          ? 'border-red-500/40 bg-red-500/10'
          : isWarning
          ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Drop Tolerance</div>
      <div
        className={`text-2xl font-bold tabular-nums ${
          isCritical ? 'text-red-400 animate-pulse' : isWarning ? 'text-orange-400' : 'text-white/80'
        }`}
      >
        {dropTol.toFixed(1)}%
      </div>
      <div className="mt-1 text-xs text-white/40">
        {isCritical
          ? '⚠ Critical — account at high risk'
          : 'Collateral buffer vs total exposure'}
      </div>
    </div>
  )
}
