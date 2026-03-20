'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/wallet', label: 'Wallet Explorer' },
]

export function Nav() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()

  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-1 px-4">
        <Link
          href="/wallet"
          className="mr-6 text-sm font-bold tracking-widest text-foreground uppercase"
        >
          NadoLens
        </Link>
        {navLinks.map(({ href, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'text-sm transition-colors',
                active
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </Link>
          )
        })}
        {isConnected && address && (
          <Link
            href={`/wallet/${address}`}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'text-sm transition-colors',
              pathname.startsWith(`/wallet/${address}`)
                ? 'bg-primary/10 text-primary'
                : 'text-primary/60 hover:text-primary hover:bg-primary/5'
            )}
          >
            My Wallet
          </Link>
        )}
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <ConnectButton
            accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
            showBalance={false}
            chainStatus={{ smallScreen: 'icon', largeScreen: 'icon' }}
            label="Connect Wallet"
          />
        </div>
      </div>
    </nav>
  )
}
