import { AirdropDashboard } from "@/components/airdrop/AirdropDashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nado INK Airdrop Lookup",
  description:
    "Estimate your Nado $INK airdrop from points, tier & volume. Look up any wallet and simulate airdrop value on Ink L2.",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "/airdrop",
  },
};

export default async function AirdropAddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <AirdropDashboard initialAddress={address} />;
}
