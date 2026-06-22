import { AirdropDashboard } from "@/components/airdrop/AirdropDashboard";
import { ScrambleWord } from "@/components/ui/ScrambleWord";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Airdrop Dashboard | NadoLens",
  description:
    "Check your INK airdrop allocation, trading volume, and simulate potential airdrop value on Nado.",
};

export default function AirdropPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold tracking-tight text-foreground sm:text-3xl">
        <ScrambleWord text="Airdrop Dashboard" delay={200} cycles={8} />
      </h1>
      <AirdropDashboard />
    </div>
  );
}
