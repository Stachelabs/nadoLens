"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrambleWord } from "@/components/ui/ScrambleWord";
import { ChevronDown } from "lucide-react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

interface Feature {
  title: string;
  description: string;
  badge: "Live" | "Coming Soon";
  icon: React.ReactNode;
}

const features: Feature[] = [
  {
    title: "Live Positions",
    description:
      "Track every open position across all subaccounts — size, entry, unrealized PnL at a glance.",
    badge: "Live",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
    ),
  },
  {
    title: "Full Trade History",
    description:
      "Every fill, every fee, every realized PnL — paginated and searchable.",
    badge: "Live",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
        />
      </svg>
    ),
  },
  {
    title: "Win Rate & Stats",
    description:
      "Best trade, worst trade, win rate — the full scorecard at a glance.",
    badge: "Live",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.27.308 6.023 6.023 0 0 1-2.27-.308"
        />
      </svg>
    ),
  },
  {
    title: "Equity Curve",
    description:
      "See how your portfolio evolved over time with an interactive chart.",
    badge: "Live",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"
        />
      </svg>
    ),
  },
  {
    title: "Fees & Funding",
    description:
      "Breakdown of fees and funding payments by product — know where your edge leaks.",
    badge: "Live",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },

  {
    title: "Open Orders",
    description: "Monitor pending limits and stops in real-time.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },
  {
    title: "Share Your PnL",
    description: "Export performance cards to flex on CT.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
        />
      </svg>
    ),
  },
  {
    title: "Chart Tracking",
    description:
      "A real-time monitoring chart is on the way — track prices, entries and liquidation levels visually.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
        />
      </svg>
    ),
  },
  {
    title: "TG Notifications",
    description:
      "Get real-time Telegram alerts on fills and liquidations — never miss a move.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
        />
      </svg>
    ),
  },
];

const heroVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 200, damping: 20 },
  },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 180, damping: 22 },
  },
};

export default function WalletPage() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [hasScrolled, setHasScrolled] = useState(false);
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => {
    if (y > 20) setHasScrolled(true);
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!isAddress(trimmed)) {
      setError("Invalid Ethereum address");
      return;
    }
    router.push(`/wallet/${trimmed}`);
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <motion.section
        className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-12 pb-8 text-center"
        variants={heroVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          variants={heroItemVariants}
          className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          <ScrambleWord text="Wallet Explorer" delay={200} cycles={8} />
        </motion.h1>

        <motion.p
          variants={heroItemVariants}
          className="mb-8 text-base text-muted-foreground md:text-lg"
        >
          X-ray any Nado wallet — every position, every trade, every edge.
        </motion.p>

        <motion.form
          variants={heroItemVariants}
          onSubmit={handleSearch}
          className="flex w-full max-w-md gap-2"
        >
          <Input
            placeholder="0x..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            className="font-mono text-sm"
          />
          <Button type="submit">Search</Button>
        </motion.form>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-sm text-destructive"
          >
            {error}
          </motion.p>
        )}

        {isConnected && address && (
          <motion.div variants={heroItemVariants}>
            <Button
              variant="ghost"
              className="mt-6 text-sm text-brand hover:text-brand/80"
              onClick={() => router.push(`/wallet/${address}`)}
            >
              View my wallet →
            </Button>
          </motion.div>
        )}
      </motion.section>

      {/* Feature cards */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:pt-8">
        <motion.h2
          className="mb-6 text-center text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          What you unlock
        </motion.h2>

        {/* Scroll indicator — mobile only */}
        <motion.div
          className="mb-6 flex justify-center sm:hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: hasScrolled ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          style={{ pointerEvents: hasScrolled ? "none" : "auto" }}
        >
          <ChevronDown className="size-7 animate-bounce text-muted-foreground/50" />
        </motion.div>

        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 auto-rows-[1fr]"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={cardVariants}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group"
            >
              <div className="flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-brand/30">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    {f.icon}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      f.badge === "Live"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {f.badge}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  );
}
