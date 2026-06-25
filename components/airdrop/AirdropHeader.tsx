"use client";

import { ScrambleWord } from "@/components/ui/ScrambleWord";
import { BookOpen } from "lucide-react";

export function AirdropHeader() {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-3xl">
        <ScrambleWord text="Airdrop Dashboard" delay={200} cycles={8} />
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Turn your Nado Points into an estimated{" "}
        <span className="bg-linear-to-r from-brand/70 to-brand bg-clip-text text-transparent">
          $INK
        </span>{" "}
        value
        <span className="hidden sm:inline">
          {" - "} <BookOpen className="inline size-3.5" />{" "}
          <a
            href="https://docs.nado.xyz/points"
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition-colors hover:text-foreground"
          >
            Read more about Nado Points
          </a>
        </span>
      </p>
      <a
        href="https://docs.nado.xyz/points"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline transition-colors hover:text-foreground sm:hidden"
      >
        <BookOpen className="size-3.5" />
        Read more about Nado Points
      </a>
    </div>
  );
}
