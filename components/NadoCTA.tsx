"use client";

import { Rocket } from "lucide-react";

const REFLINK = "https://app.nado.xyz?join=ak8qEBT";

export function NadoCTA() {
  return (
    <div className="relative overflow-hidden rounded-xl p-px">
      <div className="absolute -inset-full animate-[border-spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_50%,var(--brand)_75%,transparent_100%)]" />
      <div className="relative flex flex-col items-center gap-4 rounded-xl bg-card p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl bg-brand/10">
          <Rocket className="size-7 text-brand" />
        </div>
        <h3 className="text-lg font-bold text-foreground sm:text-xl">
          Not trading on{" "}
          <span className="bg-linear-to-r from-brand/70 to-brand bg-clip-text text-transparent">
            Nado
          </span>{" "}
          yet?
        </h3>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Don&apos;t miss out on one of the hottest airdrops to come. Trade
          perps & spot on Nado and get a share of the $INK airdropped supply
          from Kraken.
        </p>
        <a
          href={REFLINK}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition-all hover:bg-brand/90 hover:shadow-[0_0_24px_rgba(139,92,246,0.5)]"
        >
          <span className="pointer-events-none absolute inset-0 rounded-lg bg-brand/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
          Trade on Nado & Earn Points
          <svg
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="size-4 shrink-0"
          >
            <rect width="16" height="16" rx="8" fill="#000000" />
            <path
              d="M6.07043 8.80217L9.04132 12.1153L9.27295 12.2427H9.97891L10.1263 12.0941V10.9047L10.021 10.6604L8.21972 8.61077C7.76681 8.10097 7.41918 7.63363 6.75534 7.50627L6.83957 7.21953L6.397 7.27278L5.99655 8.56832L6.07043 8.80181V8.80217ZM8.33536 5.17027L3.99503 6.09417L3.7634 6.23232L3.41577 6.85868L3.47894 7.06051L4.50076 7.65522L4.75345 7.68724L7.41882 7.13499C8.08267 6.99683 8.66193 6.92272 9.10449 6.41293L9.33612 6.65721L9.51529 6.24311L8.56699 5.22352L8.33536 5.17063V5.17027ZM10.3476 8.93996L11.717 4.69214V4.41619L11.3587 3.80027L11.1481 3.75781L10.1263 4.35251L9.9682 4.55435L9.11484 7.15621C8.90426 7.80416 8.67228 8.34562 8.89356 8.99321L8.56699 9.06768L8.83038 9.42889L10.1788 9.12092L10.3472 8.94032L10.3476 8.93996Z"
              fill="white"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
