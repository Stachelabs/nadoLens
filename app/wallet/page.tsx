'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAddress } from 'viem'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAccount } from 'wagmi'

export default function WalletPage() {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const { address, isConnected } = useAccount()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!isAddress(trimmed)) {
      setError('Invalid Ethereum address')
      return
    }
    router.push(`/wallet/${trimmed}`)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Wallet Explorer</h1>
      <p className="mb-10 text-muted-foreground">
        Analyse any Nado wallet — positions, trades, PnL.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="0x..."
          value={input}
          onChange={(e) => { setInput(e.target.value); setError('') }}
          className="font-mono text-sm"
        />
        <Button type="submit">Search</Button>
      </form>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {isConnected && address && (
        <Button
          variant="ghost"
          className="mt-6 text-sm text-muted-foreground"
          onClick={() => router.push(`/wallet/${address}`)}
        >
          View my wallet →
        </Button>
      )}
    </div>
  )
}
