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

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>
          Built for Nado traders.{" "}
          <a
            href="https://github.com/silent7-x/nadoLens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:text-purple-400"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
