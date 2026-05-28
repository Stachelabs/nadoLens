"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const REFERRAL_URL = "https://app.nado.xyz?join=ak8qebt";

function LensIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="lens-grad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="40%" stopColor="#A78BFA" />
          <stop offset="70%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#7C3AED" />
        </radialGradient>
      </defs>
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke="url(#lens-grad)"
        strokeWidth="2"
      />
      <circle cx="10.5" cy="10.5" r="4" fill="url(#lens-grad)" opacity="0.15" />
      <line
        x1="15.5"
        y1="15.5"
        x2="20"
        y2="20"
        stroke="url(#lens-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ReferralCTA() {
  return (
    <Dialog>
      <DialogTrigger
        className="group fixed bottom-6 right-6 z-40 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
        aria-label="Support NadoLens — trade with our referral"
      >
        <motion.div
          className="flex size-12 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm border border-border/50 sm:size-14"
          animate={{
            y: [0, -3, 0],
            boxShadow: [
              "0 0 8px 2px rgba(139, 92, 246, 0.15)",
              "0 0 20px 6px rgba(139, 92, 246, 0.35)",
              "0 0 8px 2px rgba(139, 92, 246, 0.15)",
            ],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          whileHover={{
            scale: 1.1,
            boxShadow: "0 0 24px 8px rgba(139, 92, 246, 0.45)",
          }}
          whileTap={{ scale: 0.95 }}
        >
          <LensIcon className="size-6 sm:size-7 transition-transform duration-300 group-hover:scale-125" />
        </motion.div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md pb-6 sm:pb-4">
        <DialogHeader>
          <DialogTitle className="text-center text-[17px] pr-2 sm:pr-0 pt-6 sm:pt-2">
            See the market through a sharper lens
          </DialogTitle>
          <DialogDescription className="text-center leading-relaxed">
            NadoLens is free, open, and built by traders. Support the project —
            Trade on Nado with our referral and help keep the lights on.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center pt-2">
          <a
            href={REFERRAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition-all hover:bg-brand/90 hover:shadow-[0_0_24px_rgba(139,92,246,0.5)]"
          >
            <span className="pointer-events-none absolute inset-0 rounded-lg bg-brand/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
            Trade on Nado
            <ExternalLink className="size-4" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
