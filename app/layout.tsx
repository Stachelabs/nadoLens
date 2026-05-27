import type { Metadata } from 'next'
import { Outfit, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { headers } from 'next/headers'
import { Providers } from './providers'
import { Nav } from '@/components/Nav'
import { Footer } from '@/components/Footer'
import { Toaster } from 'sonner'
import { ReferralCTA } from '@/components/ReferralCTA'
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

export const metadata: Metadata = {
  title: 'NadoLens',
  description: 'Nado Protocol Analytics',
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
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <Providers cookie={cookie}>
            <div className="flex min-h-screen flex-col">
              <Nav />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
            <Toaster position="bottom-right" theme="dark" richColors />
            <ReferralCTA />
          </Providers>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
