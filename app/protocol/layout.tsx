import type { Metadata } from "next"
import { JsonLd } from "@/components/seo/JsonLd"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nadolens.xyz"

export const metadata: Metadata = {
  title: "Nado Protocol Dashboard — OI, Volumes, TVL",
  description:
    "Live protocol metrics for Nado DEX: open interest, 24h volumes, TVL, revenue, and funding rates. All-time and daily views with per-market breakdowns.",
  openGraph: {
    title: "Nado Protocol Dashboard — OI, Volumes, TVL | NadoLens",
    description:
      "Live protocol metrics for Nado DEX: open interest, 24h volumes, TVL, revenue, and funding rates. All-time and daily views with per-market breakdowns.",
    url: "/protocol",
  },
  twitter: {
    title: "Nado Protocol Dashboard — OI, Volumes, TVL | NadoLens",
    description:
      "Live protocol metrics for Nado DEX: open interest, 24h volumes, TVL, revenue, and funding rates. All-time and daily views with per-market breakdowns.",
  },
  alternates: {
    canonical: "/protocol",
  },
}

export default function ProtocolLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={{
          "@type": "BreadcrumbList",
          items: [
            { name: "NadoLens", url: SITE_URL },
            { name: "Protocol Dashboard", url: `${SITE_URL}/protocol` },
          ],
        }}
      />
      {children}
    </>
  )
}
