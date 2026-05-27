import type { Metadata } from "next"

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
}

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return children
}
