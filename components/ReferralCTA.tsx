"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

const REFERRAL_URL = "https://app.nado.xyz?join=ak8qebt";
const X_URL = "https://x.com/stache_dev";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

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
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        className="group fixed bottom-6 right-6 z-40 flex size-12 cursor-pointer items-center justify-center rounded-full border border-border/50 bg-card/80 outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-ring sm:size-14"
        aria-label="Support NadoLens — trade with our referral"
        animate={
          prefersReducedMotion
            ? undefined
            : {
                y: [0, -3, 0],
                boxShadow: [
                  "0 0 8px 2px rgba(139, 92, 246, 0.15)",
                  "0 0 20px 6px rgba(139, 92, 246, 0.35)",
                  "0 0 8px 2px rgba(139, 92, 246, 0.15)",
                ],
              }
        }
        transition={
          prefersReducedMotion
            ? undefined
            : {
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
        whileHover={
          prefersReducedMotion
            ? undefined
            : {
                scale: 1.1,
                boxShadow: "0 0 24px 8px rgba(139, 92, 246, 0.45)",
              }
        }
        whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
      >
        <LensIcon
          className={cn(
            "size-6 sm:size-7",
            !prefersReducedMotion &&
              "transition-transform duration-300 group-hover:scale-125",
          )}
        />
      </motion.button>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-[500px] pb-6 sm:pb-4">
            <DialogHeader>
              <DialogTitle className="text-center text-[17px] pr-2 sm:pr-0 pt-6 sm:pt-2">
                See the market through a sharper lens
              </DialogTitle>
              <DialogDescription className="text-center leading-relaxed">
                NadoLens is free, open-source, and built solo for traders.
                Support the project by trading on Nado with our referral and
                give the dev a{" "}
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2 transition-colors hover:text-primary"
                >
                  follow
                </a>{" "}
                on <XIcon className="inline size-3" />
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
      )}
    </>
  );
}
