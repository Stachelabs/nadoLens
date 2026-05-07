import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Wallet Explorer | NadoLens",
  description: "Explore wallet positions, PnL, and trading history on Nado",
}

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return children
}
