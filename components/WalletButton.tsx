'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted
        const connected = ready && account && chain

        if (!ready) return <div aria-hidden style={{ opacity: 0 }} />

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className={cn(
                buttonVariants({ variant: 'default', size: 'sm' }),
                'bg-purple-600 hover:bg-purple-700 text-white',
              )}
            >
              Connect Wallet
            </button>
          )
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className={buttonVariants({ variant: 'destructive', size: 'sm' })}
            >
              Wrong network
            </button>
          )
        }

        return (
          <div className="flex items-center gap-1">
            {chain.hasIcon && (
              <button
                onClick={openChainModal}
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7')}
                title={chain.name}
              >
                {chain.iconUrl && (
                  <img src={chain.iconUrl} alt={chain.name} className="size-4 rounded-full" />
                )}
              </button>
            )}
            <button
              onClick={openAccountModal}
              className={cn(
                buttonVariants({ variant: 'secondary', size: 'sm' }),
                'font-mono text-xs',
              )}
            >
              {account.displayName}
            </button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
