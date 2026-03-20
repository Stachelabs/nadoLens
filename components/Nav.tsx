'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/wallet', label: 'Wallet Explorer' },
]

export function Nav() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/wallet" className="text-sm font-bold tracking-tight text-primary">
          NadoLens
        </Link>

        <div className="flex items-center gap-4">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'text-sm transition-colors hover:text-foreground',
                pathname?.startsWith(href)
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {label}
            </Link>
          ))}
          {isConnected && address && (
            <Link
              href={`/wallet/${address}`}
              className={cn(
                'text-sm transition-colors hover:text-foreground',
                pathname === `/wallet/${address}`
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              My Wallet
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton
            label="Connect Wallet"
            showBalance={false}
            chainStatus="none"
            accountStatus="avatar"
          />
        </div>
      </div>
    </nav>
  )
}
