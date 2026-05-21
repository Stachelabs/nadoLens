"use client";

import { useCallback, useRef, useState } from "react";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*<>{}[]|~░▒▓█▀▄";
const SCRAMBLE_SPEED = 40;
const DEFAULT_CYCLES = 10;

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

export function useScrambleText(text: string, cycles = DEFAULT_CYCLES) {
  const [display, setDisplay] = useState(text);
  const rafRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const run = useCallback(
    (targetText: string, reverse: boolean) => {
      stop();
      isRunningRef.current = true;

      const len = targetText.length;
      const resolved = new Array<boolean>(len).fill(false);
      const chars = targetText.split("").map(() => randomChar());
      const cyclesPerChar = new Array<number>(len).fill(0);
      let lastTick = 0;
      let nextRevealIndex = reverse ? len - 1 : 0;

      const tick = (now: number) => {
        if (!isRunningRef.current) return;

        if (now - lastTick >= SCRAMBLE_SPEED) {
          lastTick = now;

          for (let i = 0; i < len; i++) {
            if (!resolved[i]) {
              chars[i] = randomChar();
              cyclesPerChar[i]++;
            }
          }

          const revealIdx = nextRevealIndex;
          if (revealIdx >= 0 && revealIdx < len && cyclesPerChar[revealIdx] >= cycles) {
            resolved[revealIdx] = true;
            chars[revealIdx] = targetText[revealIdx];
            nextRevealIndex += reverse ? -1 : 1;
          }

          setDisplay(chars.join(""));

          if (resolved.every(Boolean)) {
            isRunningRef.current = false;
            setDisplay(targetText);
            return;
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [stop, cycles]
  );

  const scramble = useCallback(() => {
    run(text, false);
  }, [run, text]);

  const unscramble = useCallback(() => {
    run(text, true);
  }, [run, text]);

  return { display, scramble, unscramble, stop };
}
