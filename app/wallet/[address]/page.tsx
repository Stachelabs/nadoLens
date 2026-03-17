'use client'

import { use } from 'react'
import Link from 'next/link'
import { useWalletData } from '@/hooks/useWalletData'
import { WalletHeader } from '@/components/wallet/WalletHeader'
import { WalletStats } from '@/components/wallet/WalletStats'
import { WalletPositions } from '@/components/wallet/WalletPositions'
import { WalletTradeHistory } from '@/components/wallet/WalletTradeHistory'
import { WalletEquityCurve } from '@/components/wallet/WalletEquityCurve'

interface Props {
  params: Promise<{ address: string }>
}

export default function WalletAddressPage({ params }: Props) {
  const { address } = use(params)
  const { stats, loading, error } = useWalletData(address)

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/wallet"
          className="text-white/30 hover:text-white/60 transition-colors text-sm"
        >
          ← Search
        </Link>
        <h1 className="text-lg font-bold text-white/80">Wallet Explorer</h1>
      </div>

      {loading && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center text-sm text-white/40">
          Loading wallet data…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {stats && (
        <>
          <WalletHeader stats={stats} />
          <WalletStats stats={stats} />
          <WalletEquityCurve trades={stats.trades} />
          <WalletPositions positions={stats.positions} />
          <WalletTradeHistory trades={stats.trades} />
        </>
      )}
    </div>
  )
}
