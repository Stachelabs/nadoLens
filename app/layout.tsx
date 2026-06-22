import type { Metadata } from 'next'
import { Outfit, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { headers } from 'next/headers'
import { Providers } from './providers'
import { Nav } from '@/components/Nav'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/seo/JsonLd'
import { Toaster } from 'sonner'
import { ReferralCTA } from '@/components/ReferralCTA'
import { TwitterCTA } from '@/components/TwitterCTA'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const outfit = Outfit({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nadolens.xyz'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NadoLens — Nado Analytics Dashboard | Ink Chain DeFi',
    template: '%s | NadoLens',
  },
  description:
    'Real-time analytics for Nado Protocol on Ink L2. Track wallet PnL, open interest, volumes, TVL, and funding rates — the complete trading dashboard.',
  openGraph: {
    type: 'website',
    siteName: 'NadoLens',
    locale: 'en_US',
    url: SITE_URL,
    title: 'NadoLens — Nado Analytics Dashboard',
    description:
      'Real-time analytics for Nado Protocol on Ink L2. Track wallet PnL, open interest, volumes, TVL, and funding rates — the complete trading dashboard.',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@stache_dev',
    creator: '@stache_dev',
    title: 'NadoLens — Nado Analytics Dashboard',
    description:
      'Real-time analytics for Nado Protocol on Ink L2. Track wallet PnL, open interest, volumes, TVL, and funding rates — the complete trading dashboard.',
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon', type: 'image/png', sizes: '48x48' },
    ],
    apple: '/apple-icon',
  },
  verification: {
    google: 'bCXyq2MBAsKVlMiXFk0ASR8xD_4Ed9ReJO-KlwCXoX8',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookie = (await headers()).get('cookie')

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground">
        <JsonLd
          data={{
            '@type': 'WebApplication',
            name: 'NadoLens',
            url: SITE_URL,
            description:
              'Real-time analytics for Nado Protocol on Ink L2. Track wallet PnL, open interest, volumes, TVL, and funding rates.',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Any',
            browserRequirements: 'Requires JavaScript',
          }}
        />
        <JsonLd
          data={{
            '@type': 'Organization',
            name: 'NadoLens',
            url: SITE_URL,
            logo: `${SITE_URL}/opengraph-image`,
            sameAs: ['https://x.com/stache_dev'],
          }}
        />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <Providers cookie={cookie}>
            <div className="flex min-h-screen flex-col">
              <Nav />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
            <Toaster position="bottom-right" theme="dark" richColors />
            <ReferralCTA />
            <TwitterCTA />
          </Providers>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
