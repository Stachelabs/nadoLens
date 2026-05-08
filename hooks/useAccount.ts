'use client'

import { useEffect, useRef } from 'react'
import { useAccount as useWagmiAccount } from 'wagmi'
import type { Address } from 'viem'
import { useAccountStore } from '@/store/accountStore'
import type { AccountHealth, RiskLevel } from '@/types/nado'
import { parseSubaccountInfo } from '@/lib/parseSubaccountInfo'

const POLL_INTERVAL = 10_000

function toSubaccount(address: Address): string {
  const addr = address.toLowerCase().replace('0x', '')
  return `0x${addr}64656661756c740000000000`
}

function riskFromUsage(usage: number): RiskLevel {
  if (usage > 0.66) return 'danger'
  if (usage > 0.33) return 'warning'
  return 'safe'
}

function toAccountHealth(parsed: ReturnType<typeof parseSubaccountInfo>): AccountHealth | null {
  if (!parsed) return null
  return {
    health_score: parsed.healthScore,
    total_collateral_usd: parsed.totalCollateral,
    maintenance_margin: parsed.totalMaintMargin,
    maint_margin_usage: parsed.maintMarginUsage,
    available_margin: parsed.availableMargin,
    total_notional: parsed.totalNotional,
    risk_level: riskFromUsage(parsed.maintMarginUsage),
    drop_tolerance: parsed.dropTolerance,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccount(): void {
  const { address, isConnected } = useWagmiAccount()
  const { setHealth, setPositions, setAddress, clear } = useAccountStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isConnected || !address) {
      clear()
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    setAddress(address)
    const subaccount = toSubaccount(address)
    let currentController: AbortController | null = null

    const fetchData = async () => {
      currentController?.abort()
      const controller = new AbortController()
      currentController = controller
      try {
        const res = await fetch(`/api/wallet/${subaccount}?query=subaccount_info`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) return
        const raw: unknown = await res.json()
        const parsed = parseSubaccountInfo(raw)
        const health = toAccountHealth(parsed)
        if (health && parsed) {
          setHealth(health)
          setPositions(parsed.positions)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    void fetchData()
    intervalRef.current = setInterval(() => void fetchData(), POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      currentController?.abort()
    }
  }, [address, isConnected, setHealth, setPositions, setAddress, clear])
}
