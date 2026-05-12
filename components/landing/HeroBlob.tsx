"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

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

function InkSplatter() {
  const turbRef = useRef<SVGFETurbulenceElement>(null);

  useEffect(() => {
    let frame: number;
    let t = 0;
    const animate = () => {
      t += 0.003;
      if (turbRef.current) {
        turbRef.current.setAttribute(
          "baseFrequency",
          `${0.02 + Math.sin(t) * 0.008} ${0.02 + Math.cos(t * 0.7) * 0.008}`,
        );
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative">
      {/* SVG filter definition */}
      <svg className="absolute h-0 w-0" aria-hidden>
        <defs>
          <filter id="ink-distort" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0.02"
              numOctaves={3}
              seed={2}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={18}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          {/* Glow filter */}
          <filter id="ink-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.4 0"
            />
          </filter>

          {/* Ink gradient */}
          <radialGradient id="ink-grad" cx="45%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="35%" stopColor="#8B5CF6" />
            <stop offset="70%" stopColor="#6A00FF" />
            <stop offset="100%" stopColor="#3B0080" />
          </radialGradient>
        </defs>
      </svg>

      {/* Glow behind */}
      <motion.svg
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        width={500}
        height={500}
        viewBox="0 0 500 500"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.05 }}
      >
        <g filter="url(#ink-glow)">
          <path
            d="M250 80 C290 75,340 90,370 120 C395 145,410 180,405 210 C415 225,440 235,445 260 C450 290,430 320,410 340 C425 355,445 380,430 400 C415 415,385 425,360 420 C340 430,310 445,280 440 C250 445,220 430,195 415 C170 405,145 420,125 405 C100 385,90 355,95 330 C80 315,60 295,65 270 C70 245,90 225,95 205 C90 180,75 150,90 125 C105 105,130 85,160 80 C190 75,220 78,250 80 Z"
            fill="url(#ink-grad)"
          />
        </g>
      </motion.svg>

      {/* Main ink splatter */}
      <motion.svg
        className="relative"
        width={380}
        height={380}
        viewBox="0 0 500 500"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 18, delay: 0.1 }}
        style={{ filter: "url(#ink-distort)" }}
      >
        {/* Main splatter body */}
        <path
          d="M250 80 C290 75,340 90,370 120 C395 145,410 180,405 210 C415 225,440 235,445 260 C450 290,430 320,410 340 C425 355,445 380,430 400 C415 415,385 425,360 420 C340 430,310 445,280 440 C250 445,220 430,195 415 C170 405,145 420,125 405 C100 385,90 355,95 330 C80 315,60 295,65 270 C70 245,90 225,95 205 C90 180,75 150,90 125 C105 105,130 85,160 80 C190 75,220 78,250 80 Z"
          fill="url(#ink-grad)"
        />

        {/* Splatter drips / satellite drops */}
        <circle cx="420" cy="155" r="12" fill="#7C3AED" opacity={0.85} />
        <circle cx="445" cy="190" r="7" fill="#8B5CF6" opacity={0.7} />
        <circle cx="460" cy="170" r="5" fill="#6D28D9" opacity={0.6} />
        <circle cx="80" cy="185" r="10" fill="#7C3AED" opacity={0.8} />
        <circle cx="55" cy="210" r="6" fill="#8B5CF6" opacity={0.65} />
        <circle cx="395" cy="420" r="9" fill="#7C3AED" opacity={0.75} />
        <circle cx="120" cy="430" r="8" fill="#6D28D9" opacity={0.7} />
        <circle cx="100" cy="445" r="5" fill="#8B5CF6" opacity={0.55} />
        <circle cx="330" cy="455" r="6" fill="#7C3AED" opacity={0.6} />
        <circle cx="460" cy="310" r="8" fill="#8B5CF6" opacity={0.7} />
        <circle cx="475" cy="280" r="5" fill="#6D28D9" opacity={0.5} />
        <circle cx="50" cy="320" r="7" fill="#7C3AED" opacity={0.65} />

        {/* Splatter arms / extensions */}
        <path
          d="M370 120 C385 105,400 100,415 108 C420 112,418 120,410 118"
          fill="#7C3AED"
          opacity={0.8}
        />
        <path
          d="M405 210 C420 200,435 195,445 205 C448 210,442 215,435 212"
          fill="#6D28D9"
          opacity={0.7}
        />
        <path
          d="M95 205 C80 195,65 195,58 205 C55 212,62 215,68 210"
          fill="#7C3AED"
          opacity={0.75}
        />
        <path
          d="M125 405 C115 418,105 430,110 440 C115 445,122 438,118 430"
          fill="#6D28D9"
          opacity={0.7}
        />
        <path
          d="M430 400 C442 408,455 412,458 405 C460 398,450 398,445 402"
          fill="#8B5CF6"
          opacity={0.65}
        />

        {/* Inner highlight (wet ink reflection) */}
        <ellipse
          cx="230"
          cy="230"
          rx="60"
          ry="35"
          fill="white"
          opacity={0.08}
          transform="rotate(-15 230 230)"
        />
        <ellipse
          cx="280"
          cy="280"
          rx="30"
          ry="15"
          fill="white"
          opacity={0.05}
          transform="rotate(20 280 280)"
        />
      </motion.svg>

      {/* Text overlay */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <span
          className="select-none text-4xl font-bold tracking-tight text-white md:text-5xl"
          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5), 0 0 40px rgba(139,92,246,0.3)" }}
        >
          NadoLens
        </span>
      </motion.div>
    </div>
  );
}

export function HeroBlob() {
  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 pt-12 pb-20">
      <InkSplatter />

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
