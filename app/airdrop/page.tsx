import { AirdropDashboard } from "@/components/airdrop/AirdropDashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Airdrop Dashboard | NadoLens",
  description:
    "Check your INK airdrop allocation, trading volume, and simulate potential airdrop value on Nado.",
};

export default function AirdropPage() {
  return <AirdropDashboard />;
}
