"use client";

import { motion } from "framer-motion";

const blobKeyframes = [
  "60% 40% 30% 70% / 60% 30% 70% 40%",
  "30% 60% 70% 40% / 50% 60% 30% 60%",
  "50% 30% 60% 40% / 40% 50% 60% 50%",
  "60% 40% 30% 70% / 60% 30% 70% 40%",
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delayChildren: 0.8, staggerChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 200, damping: 20 },
  },
};

export function HeroBlob() {
  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 pt-12 pb-20">
      {/* Glow layer (behind blob) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute"
        animate={{ borderRadius: blobKeyframes }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 500,
          height: 500,
          background:
            "radial-gradient(circle at 40% 40%, #8B5CF6, #6A00FF 60%, transparent 80%)",
          filter: "blur(80px)",
          opacity: 0.25,
        }}
      />

      {/* Blob */}
      <motion.div
        className="relative flex items-center justify-center"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }}
      >
        <motion.div
          className="flex items-center justify-center"
          animate={{ borderRadius: blobKeyframes }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width: 320,
            height: 320,
            background:
              "radial-gradient(circle at 30% 30%, #8B5CF6, #6A00FF 50%, #3B0080 100%)",
            boxShadow: "0 0 80px rgba(106, 0, 255, 0.3), inset 0 0 60px rgba(139, 92, 246, 0.2)",
          }}
        >
          <motion.span
            className="select-none text-4xl font-bold tracking-tight text-white md:text-5xl"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            style={{ mixBlendMode: "overlay", textShadow: "0 0 40px rgba(255,255,255,0.4)" }}
          >
            nadoLens
          </motion.span>
        </motion.div>
      </motion.div>

      {/* Text content with stagger */}
      <motion.div
        className="mt-10 flex flex-col items-center gap-4 text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          variants={itemVariants}
          className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl"
        >
          The cockpit for{" "}
          <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
            Nado
          </span>{" "}
          traders
        </motion.h1>

        <motion.p
          variants={itemVariants}
          className="max-w-lg text-base text-muted-foreground md:text-lg"
        >
          Real-time wallet analytics & protocol dashboards for the Nado CLOB DEX
          on Ink L2.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="mt-2 flex flex-wrap items-center justify-center gap-3"
        >
          {/* Primary CTA — glow button */}
          <a
            href="https://app.nado.xyz?join=ak8qEBT"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-purple-500 hover:shadow-[0_0_24px_rgba(139,92,246,0.5)]"
          >
            <span className="pointer-events-none absolute inset-0 rounded-lg bg-purple-500/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
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

          {/* Secondary CTA */}
          <a
            href="/protocol"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/80"
          >
            Launch Dashboard
            <svg
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
