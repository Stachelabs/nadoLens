'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { ThemeToggle } from './ThemeToggle'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/wallet', label: 'Wallet' },
]

export function Nav() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()

  const allLinks = [
    ...navLinks,
    ...(isConnected && address
      ? [{ href: `/wallet/${address}`, label: 'My Wallet' }]
      : []),
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        {/* Logo */}
        <Link
          href="/wallet"
          className="text-sm font-bold tracking-tight text-foreground uppercase"
        >
          NadoLens
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1">
          {allLinks.map(({ href, label }) => {
            const isActive = pathname?.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  buttonVariants({ variant: isActive ? 'outline' : 'ghost', size: 'sm' }),
                  !isActive && 'text-muted-foreground',
                )}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton
            label="Connect Wallet"
            showBalance={false}
            chainStatus={{ smallScreen: 'icon', largeScreen: 'icon' }}
            accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
          />
        </div>
      </div>
    </nav>
  )
}
