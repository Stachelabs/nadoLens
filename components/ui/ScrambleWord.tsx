"use client";

import { useEffect, useRef, useState } from "react";
import { useScrambleText } from "@/hooks/useScrambleText";

interface ScrambleWordProps {
  text: string;
  className?: string;
  delay?: number;
  cycles?: number;
}

export function ScrambleWord({ text, className, delay = 0, cycles = 20 }: ScrambleWordProps) {
  const { display, scramble } = useScrambleText(text, cycles);
  const hasFiredOnce = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [lockedWidth, setLockedWidth] = useState<number | undefined>();

  useEffect(() => {
    if (ref.current && lockedWidth === undefined) {
      setLockedWidth(ref.current.offsetWidth);
    }
  }, [lockedWidth]);

  useEffect(() => {
    const id = setTimeout(() => {
      scramble();
      hasFiredOnce.current = true;
    }, delay);
    return () => clearTimeout(id);
  }, [scramble, delay]);

  return (
    <span
      ref={ref}
      className={`cursor-pointer inline-block whitespace-nowrap ${className ?? ""}`}
      style={lockedWidth ? { width: lockedWidth } : undefined}
      onMouseEnter={() => { if (hasFiredOnce.current) scramble(); }}
    >
      {display}
    </span>
  );
}
