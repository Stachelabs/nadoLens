"use client";

import { motion } from "framer-motion";

const features = [
  {
    title: "Wallet Explorer",
    description:
      "Analyze any Nado wallet in real-time — open positions, PnL breakdown, equity curves, and full trade history.",
    badge: "Live",
    href: "/wallet",
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
      </svg>
    ),
  },
  {
    title: "Protocol Analytics",
    description:
      "5-tab dashboard covering volume, open interest, TVL, revenue, and liquidations — with daily and all-time views.",
    badge: "Live",
    href: "/protocol",
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
      </svg>
    ),
  },
  {
    title: "Airdrop Tracker",
    description:
      "Track your Ink points and Nado rewards progression — see exactly where you stand in the race.",
    badge: "Coming Soon",
    href: undefined,
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    ),
  },
];

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

export function FeatureCards() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <motion.h2
        className="mb-8 text-center text-2xl font-bold tracking-tight text-foreground md:text-3xl"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        What&apos;s inside
      </motion.h2>

      <motion.div
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        {features.map((f) => {
          const Tag = f.href ? "a" : "div";
          return (
            <motion.div
              key={f.title}
              variants={cardVariants}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group"
            >
              <Tag
                {...(f.href ? { href: f.href } : {})}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-brand/30"
              >
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
              </Tag>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
