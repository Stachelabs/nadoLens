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

  const ogParts: string[] = [];
  if (val) ogParts.push(`val=${encodeURIComponent(val)}`);
  if (hasStats) {
    ogParts.push(`pts=${encodeURIComponent(pts)}`);
    ogParts.push(`rank=${encodeURIComponent(rank)}`);
    ogParts.push(`tier=${encodeURIComponent(tier)}`);
    ogParts.push(`vol=${encodeURIComponent(vol)}`);
  }
  const ogParams = ogParts.length > 0 ? `?${ogParts.join('&')}` : '';

  // Use absolute title when personalized so root template does not double-suffix "| NadoLens"
  const title = val
    ? { absolute: `$INK Airdrop ≈ ${val} | NadoLens` as const }
    : "Nado INK Airdrop Simulator";
  const ogTitle = val
    ? `$INK Airdrop ≈ ${val} | NadoLens`
    : "Nado INK Airdrop Simulator | NadoLens";
  const description =
    "Estimate your Nado $INK airdrop from points, tier & volume. Look up any wallet and simulate airdrop value on Ink L2.";

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nadolens.xyz";

  return {
    title,
    description,
    alternates: {
      canonical: "/airdrop",
    },
    openGraph: {
      title: ogTitle,
      description,
      url: "/airdrop",
      images: [`${baseUrl}/api/og/airdrop${ogParams}`],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: {
        url: `${baseUrl}/api/og/airdrop${ogParams}`,
        alt: val
          ? `NadoLens airdrop card showing estimated value of ${val}`
          : "NadoLens airdrop simulator card",
      },
    },
  };
}

export default function AirdropPage() {
  return <AirdropDashboard />;
}
