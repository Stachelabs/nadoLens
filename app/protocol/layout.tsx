import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Protocol Analytics | NadoLens",
  description: "Real-time protocol analytics for Nado DEX",
}

export default function ProtocolLayout({ children }: { children: React.ReactNode }) {
  return children
}
