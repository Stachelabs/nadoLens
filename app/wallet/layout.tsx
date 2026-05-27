import type { Metadata } from "next"
import { JsonLd } from "@/components/seo/JsonLd"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nadolens.xyz"

export const metadata: Metadata = {
  title: "Nado Wallet Tracker",
  description:
    "Search any wallet on Nado Protocol. Track positions, PnL, equity curves, fees, and full trade history — the complete Nado trading dashboard for traders.",
  openGraph: {
    title: "Nado Wallet Tracker | NadoLens",
    description:
      "Search any wallet on Nado Protocol. Track positions, PnL, equity curves, fees, and full trade history — the complete Nado trading dashboard for traders.",
    url: "/wallet",
  },
  twitter: {
    title: "Nado Wallet Tracker | NadoLens",
    description:
      "Search any wallet on Nado Protocol. Track positions, PnL, equity curves, fees, and full trade history — the complete Nado trading dashboard for traders.",
  },
  alternates: {
    canonical: "/wallet",
  },
}

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={{
          "@type": "BreadcrumbList",
          items: [
            { name: "NadoLens", url: SITE_URL },
            { name: "Wallet Explorer", url: `${SITE_URL}/wallet` },
          ],
        }}
      />
      {children}
    </>
  )
}
