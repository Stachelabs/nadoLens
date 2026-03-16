'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/heatmap', label: 'Heatmap' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/orderbook', label: 'Orderbook' },
  { href: '/wallet', label: 'Wallet' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="border-b border-white/10 bg-black/40 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-1 px-4">
        <Link
          href="/heatmap"
          className="mr-6 text-sm font-bold tracking-widest text-white/90 uppercase"
        >
          NadoLens
        </Link>
        {navLinks.map(({ href, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
