import { useEffect } from 'react'
import { useWalletFundingStore } from '@/store/walletFundingStore'

export function useWalletFunding(address: string): void {
  useEffect(() => {
    const store = useWalletFundingStore.getState()
    store.ensureSlot(address)
    store.setActive(address)
    return () => {
      useWalletFundingStore.getState().abortAddress(address)
    }
  }, [address])
}
