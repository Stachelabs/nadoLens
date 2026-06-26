import { AirdropDashboard } from "@/components/airdrop/AirdropDashboard";
import type { Metadata } from "next";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function param(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v;
  return null;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const pts = param(sp.pts);
  const rank = param(sp.rank);
  const tier = param(sp.tier);
  const vol = param(sp.vol);
  const val = param(sp.val);
  const hasStats = pts && rank && tier && vol;

  const ogParams = hasStats
    ? `?pts=${encodeURIComponent(pts)}&rank=${encodeURIComponent(rank)}&tier=${encodeURIComponent(tier)}&vol=${encodeURIComponent(vol)}${val ? `&val=${encodeURIComponent(val)}` : ''}`
    : '';

  const title = val
    ? `$INK Airdrop ≈ ${val} | NadoLens`
    : "Airdrop Dashboard | NadoLens";

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nadolens.xyz";

  return {
    title,
    description:
      "Check your INK airdrop allocation, trading volume, and simulate potential airdrop value on Nado.",
    openGraph: {
      title,
      description:
        "Check your INK airdrop allocation, trading volume, and simulate potential airdrop value on Nado.",
      images: [`${baseUrl}/api/og/airdrop${ogParams}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description:
        "Check your INK airdrop allocation, trading volume, and simulate potential airdrop value on Nado.",
      images: [`${baseUrl}/api/og/airdrop${ogParams}`],
    },
  };
}

export default function AirdropPage() {
  return <AirdropDashboard />;
}
