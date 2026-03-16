'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function WalletPage() {
  const router = useRouter()
  const [address, setAddress] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = address.trim()
    if (trimmed) {
      router.push(`/wallet/${trimmed}`)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-white/90">Wallet Explorer</h1>
      <p className="mt-2 text-sm text-white/50">
        Analyse any Nado wallet — positions, PnL, trade history.
      </p>
      <form onSubmit={handleSearch} className="mt-6 flex gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x... or bytes32 address"
          className="flex-1 rounded border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
        >
          Search
        </button>
      </form>
    </div>
  )
}
