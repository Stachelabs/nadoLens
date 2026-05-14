"use client";

import { HeroBlob } from "@/components/landing/HeroBlob";
import { LiveMetrics } from "@/components/landing/LiveMetrics";
import { FeatureCards } from "@/components/landing/FeatureCards";

export default function Home() {
  return (
    <div className="flex flex-col">
      <HeroBlob />
      <LiveMetrics />
      <FeatureCards />
    </div>
  );
}
