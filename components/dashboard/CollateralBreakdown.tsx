'use client'

import { useAccountStore } from '@/store/accountStore'

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function CollateralBreakdown() {
  const health = useAccountStore((s) => s.health)

  if (!health) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-white/30">Collateral</div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-24 rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-16 rounded bg-white/5 animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  const items = [
    {
      label: 'Total Collateral',
      value: health.total_collateral_usd,
      color: 'text-white/80',
      prefix: '',
    },
    {
      label: 'Maint. Margin',
      value: health.maintenance_margin,
      color: 'text-orange-400',
      prefix: '-',
    },
    {
      label: 'Available Margin',
      value: health.available_margin,
      color: 'text-emerald-400',
      prefix: '',
    },
    {
      label: 'Total Notional',
      value: health.total_notional,
      color: 'text-white/50',
      prefix: '',
    },
  ]

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2.5">
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Collateral</div>

      {items.map(({ label, value, color, prefix }) => (
        <div key={label} className="flex items-center justify-between gap-2">
          <span className="text-xs text-white/40">{label}</span>
          <span className={`text-xs tabular-nums font-medium ${color}`}>
            {prefix}{fmtUsd.format(value)}
          </span>
        </div>
      ))}

      {/* Visual bar: available vs used */}
      {health.total_collateral_usd > 0 && (
        <div className="pt-1">
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-emerald-500/60 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (health.available_margin / health.total_collateral_usd) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-1 text-[9px] text-white/20 text-right">
            {((health.available_margin / health.total_collateral_usd) * 100).toFixed(0)}% free
          </div>
        </div>
      )}
    </div>
  )
}
