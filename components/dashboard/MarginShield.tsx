'use client'

import { useAccountStore } from '@/store/accountStore'

interface Props {
  children: React.ReactNode
}

export function MarginShield({ children }: Props) {
  const health = useAccountStore((s) => s.health)
  const isDanger = health?.risk_level === 'danger'
  const isWarning = health?.risk_level === 'warning'

  return (
    <div className="relative">
      {isDanger && (
        <>
          {/* Pulsing border */}
          <div className="pointer-events-none absolute -inset-2 rounded-xl border-2 border-red-500/40 animate-pulse z-10" />
          {/* Background glow */}
          <div className="pointer-events-none absolute -inset-2 rounded-xl bg-red-500/5 z-10" />
        </>
      )}
      {isWarning && !isDanger && (
        <div className="pointer-events-none absolute -inset-1 rounded-xl border border-orange-500/25 bg-orange-500/3 z-10" />
      )}
      <div className="relative z-0">{children}</div>
    </div>
  )
}
