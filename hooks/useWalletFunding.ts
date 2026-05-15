import { useEffect } from 'react'
import { useWalletFundingStore } from '@/store/walletFundingStore'

export function useWalletFunding(address: string): void {
  useEffect(() => {
    useWalletFundingStore.getState().initForAddress(address)
    return () => {
      useWalletFundingStore.getState().abort()
    }
  }, [address])
}
