"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

const TWEET_ID = "2064809235179831686";
const RT_URL = `https://twitter.com/intent/retweet?tweet_id=${TWEET_ID}`;
const FOLLOW_URL = "https://x.com/Stache_dev";
const STORAGE_KEY = "nadolens-twitter-cta-shown";
const DELAY_MS = 3 * 60 * 1000;

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function TwitterCTA() {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }

    timerRef.current = setTimeout(() => {
      setOpen(true);
    }, DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isConnected]);

  function handleClose(value: boolean) {
    setOpen(value);
    if (!value) {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // localStorage unavailable
      }
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px] pb-6 sm:pb-5">
        <DialogHeader>
          <DialogTitle className="text-center text-[17px] pr-2 sm:pr-0 pt-6 sm:pt-2">
            You use it. Help spread it 👊
          </DialogTitle>
          <DialogDescription className="text-center leading-relaxed">
            NadoLens is built solo, in the open, for traders who want real data.
            Not noise! One retweet puts it in front of someone who needs it.
            Thanks for helping 🙏
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 pt-2">
          <a
            href={RT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "group relative inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all",
              "bg-brand text-brand-foreground hover:bg-brand/90",
              "hover:shadow-[0_0_24px_rgba(139,92,246,0.5)]",
            )}
          >
            <span className="pointer-events-none absolute inset-0 rounded-lg bg-brand/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
            <XIcon className="size-4" />
            Retweet This
            <ExternalLink className="size-3.5" />
          </a>

          <a
            href={FOLLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Follow
            <XIcon className="size-3" />
            @Stache_dev
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
