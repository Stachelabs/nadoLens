import type { Metadata } from 'next'
import { Outfit, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Providers } from './providers'
import { Nav } from '@/components/Nav'
import './globals.css'

const outfit = Outfit({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'NadoLens',
  description: 'Nado Protocol Analytics',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <Providers>
            <Nav />
            <main className="flex-1">{children}</main>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
