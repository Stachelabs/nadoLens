import type { Metadata } from "next"
import { AirdropHeader } from "@/components/airdrop/AirdropHeader"
import { JsonLd } from "@/components/seo/JsonLd"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nadolens.xyz"

export const metadata: Metadata = {
  title: "Nado INK Airdrop Simulator",
  description:
    "Estimate your Nado $INK airdrop from points, tier & volume. Look up any wallet and simulate airdrop value on Ink L2.",
  openGraph: {
    title: "Nado INK Airdrop Simulator | NadoLens",
    description:
      "Estimate your Nado $INK airdrop from points, tier & volume. Look up any wallet and simulate airdrop value on Ink L2.",
    url: "/airdrop",
  },
  twitter: {
    title: "Nado INK Airdrop Simulator | NadoLens",
    description:
      "Estimate your Nado $INK airdrop from points, tier & volume. Look up any wallet and simulate airdrop value on Ink L2.",
  },
  alternates: {
    canonical: "/airdrop",
  },
}

export default function AirdropLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <JsonLd
        data={{
          "@type": "BreadcrumbList",
          items: [
            { name: "NadoLens", url: SITE_URL },
            { name: "Airdrop Dashboard", url: `${SITE_URL}/airdrop` },
          ],
        }}
      />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <AirdropHeader />
        {children}
      </div>
    </>
  )
}
