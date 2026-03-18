import type { Metadata } from 'next'
import './globals.css'
import '@rainbow-me/rainbowkit/styles.css'
import { Providers } from './providers'
import { Nav } from '@/components/Nav'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'NadoLens — Trading Intelligence for Nado DEX',
  description:
    'Real-time liquidation heatmap, survival cockpit, and wallet explorer for Nado DEX on Ink L2.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto max-w-screen-xl px-4 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
