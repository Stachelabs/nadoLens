"use client";

import { NadoCTA } from "@/components/NadoCTA";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { HeroBlob } from "@/components/landing/HeroBlob";
import { LiveMetrics } from "@/components/landing/LiveMetrics";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col">
      <HeroBlob />
      <LiveMetrics />
      <FeatureCards />
      <motion.section
        className="mx-auto w-full max-w-5xl px-4 pb-24"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
      >
        <NadoCTA />
      </motion.section>
    </div>
  );
}
