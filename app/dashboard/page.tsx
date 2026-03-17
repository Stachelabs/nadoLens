'use client'

import { useAccount as useWagmiAccount, useConnect, useDisconnect } from 'wagmi'
import { useAccount } from '@/hooks/useAccount'
import { useSurvivalMetrics } from '@/hooks/useSurvivalMetrics'
import { MarginShield } from '@/components/dashboard/MarginShield'
import { HealthBar } from '@/components/dashboard/HealthBar'
import { LiquidationGap } from '@/components/dashboard/LiquidationGap'
import { PredictiveSafety } from '@/components/dashboard/PredictiveSafety'
import { PositionsTable } from '@/components/dashboard/PositionsTable'
import { CollateralBreakdown } from '@/components/dashboard/CollateralBreakdown'

// ─── Connect wallet screen ────────────────────────────────────────────────────

function ConnectWallet() {
  const { connect, connectors, isPending } = useConnect()

  return (
    <div className="flex flex-col items-center justify-center py-32 gap-8">
      <div className="text-center space-y-2">
        <div className="text-4xl">🎯</div>
        <h2 className="text-xl font-semibold text-white/80">Cockpit de Survie</h2>
        <p className="text-sm text-white/30 max-w-xs">
          Connect your wallet to monitor positions, margin health, and liquidation risk in real-time.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:border-white/30 transition-all disabled:opacity-40"
          >
            {isPending ? 'Connecting…' : `Connect with ${connector.name}`}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Risk level styles ────────────────────────────────────────────────────────

const riskStyles = {
  safe: { text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'SAFE' },
  warning: { text: 'text-orange-400', dot: 'bg-orange-400', label: 'WARNING' },
  danger: { text: 'text-red-400', dot: 'bg-red-400', label: 'DANGER' },
} as const

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isConnected, address } = useWagmiAccount()
  const { disconnect } = useDisconnect()
  const metrics = useSurvivalMetrics()

  // Starts polling subaccount_info every 10s when wallet connected
  useAccount()

  if (!isConnected) return <ConnectWallet />

  const style = riskStyles[metrics.riskLevel]

  return (
    <MarginShield>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Cockpit de Survie</h1>
            <p className="mt-0.5 text-xs text-white/30 font-mono">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${style.text}`}>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full animate-pulse ${style.dot}`}
              />
              {style.label}
            </span>
            <button
              onClick={() => disconnect()}
              className="text-xs text-white/20 hover:text-white/50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Survival metrics row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <HealthBar />
          <LiquidationGap />
          <PredictiveSafety />
        </div>

        {/* Collateral + Positions */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <CollateralBreakdown />
          </div>
          <div className="lg:col-span-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-white/30">
              Open Positions
            </div>
            <PositionsTable />
          </div>
        </div>

        <div className="text-right text-[10px] text-white/15">
          Auto-refresh every 10s
        </div>

      </div>
    </MarginShield>
  )
}
