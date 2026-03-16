interface Props {
  params: Promise<{ address: string }>
}

export default async function WalletAddressPage({ params }: Props) {
  const { address } = await params

  return (
    <div>
      <h1 className="text-2xl font-bold text-white/90">Wallet Explorer</h1>
      <p className="mt-2 font-mono text-sm text-white/50">{address}</p>
      <p className="mt-6 text-sm text-white/40">Phase 5 — coming soon</p>
    </div>
  )
}
