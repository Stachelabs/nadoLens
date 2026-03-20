'use client'

import { use } from 'react'
import { isAddress } from 'viem'
import { notFound } from 'next/navigation'
import { useWalletData } from '@/hooks/useWalletData'
import { WalletHeader } from '@/components/wallet/WalletHeader'
import { WalletStats } from '@/components/wallet/WalletStats'
import { WalletPositions } from '@/components/wallet/WalletPositions'
import { WalletTradeHistory } from '@/components/wallet/WalletTradeHistory'
import { WalletEquityCurve } from '@/components/wallet/WalletEquityCurve'

interface Props {
  params: Promise<{ address: string }>
}

function WalletContent({ address }: { address: string }) {
  const { stats, trades, loading, error } = useWalletData(address)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Loading wallet data…
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center py-24 text-destructive text-sm">
        {error ?? 'Failed to load wallet data'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <WalletHeader stats={stats} />
      <WalletStats stats={stats} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WalletEquityCurve trades={trades} />
        <WalletPositions positions={stats.positions} />
      </div>
      <WalletTradeHistory trades={trades} />
    </div>
  )
}

export default function WalletAddressPage({ params }: Props) {
  const { address } = use(params)

  if (!isAddress(address)) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <WalletContent address={address} />
    </div>
  )
}
