import type { Metadata } from 'next'

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

type Props = {
  params: Promise<{ address: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params
  const short = truncateAddress(address)

  const title = `${short} — Wallet PnL & Positions`
  const description = `Track wallet ${short} on Nado Protocol: live positions, realized PnL, equity curve, trade history, and fee breakdown. Full on-chain analytics.`

  return {
    title,
    description,
    openGraph: {
      title: `${short} — Wallet PnL & Positions | NadoLens`,
      description,
      url: `/wallet/${address}`,
    },
    twitter: {
      title: `${short} — Wallet PnL & Positions | NadoLens`,
      description,
    },
  }
}

export default function WalletAddressLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
