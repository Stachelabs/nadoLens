import type { Metadata } from "next"

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
}

export default function ProtocolLayout({ children }: { children: React.ReactNode }) {
  return children
}
