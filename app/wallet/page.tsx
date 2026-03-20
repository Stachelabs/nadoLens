'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
      <h1 className="text-2xl font-bold text-foreground">Wallet Explorer</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Analyse any Nado wallet — positions, PnL, trade history.
      </p>
      <form onSubmit={handleSearch} className="mt-6 flex gap-2">
        <Input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x... or bytes32 address"
          className="flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
    </div>
  )
}
