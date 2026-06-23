import { create } from "zustand";

// ─── Constants (verified from docs.nado.xyz + nado-calculator.vercel.app) ─────

export const TOTAL_POINTS_POOL = 42_641_776;
export const PRE_S2_DISTRIBUTED = 26_941_776;
export const S2_WEEKLY_POOL_FLOOR = 300_000;
export const S2_WEEKLY_POOL_CAP = 950_000;

export const SCENARIOS = {
  bear: { label: "Bear", pct: 0.04, color: "var(--bear)" },
  base: { label: "Base", pct: 0.08, color: "hsl(var(--foreground))" },
  bull: { label: "Bull", pct: 0.12, color: "var(--bull)" },
} as const;

export const POOL_BREAKDOWN_FIXED = [
  { name: "S1 Distributed", value: 24_941_776, color: "#8b5cf6" },
  { name: "Builder Codes", value: 1_000_000, color: "#a78bfa" },
  { name: "Comp / Reserve", value: 1_000_000, color: "#6d28d9" },
] as const;

export const FIXED_TOTAL = POOL_BREAKDOWN_FIXED.reduce((s, e) => s + e.value, 0);

export const TIER_NAMES: Record<number, string> = {
  1: "Breeze",
  2: "Gust",
  3: "Wind",
  4: "Storm",
  5: "Tornado",
};

// ─── Volume → weekly points curve (S2 scaling approximation) ──────────────────

export function volumeToWeeklyPoints(dailyVolumeM: number): number {
  if (dailyVolumeM <= 0) return S2_WEEKLY_POOL_FLOOR;
  const raw =
    S2_WEEKLY_POOL_FLOOR +
    (S2_WEEKLY_POOL_CAP - S2_WEEKLY_POOL_FLOOR) *
      (1 - Math.exp(-dailyVolumeM / 800));
  return Math.min(Math.round(raw), S2_WEEKLY_POOL_CAP);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type VolumeByProduct = { productId: number; volume: number };

type EpochData = {
  epoch: number;
  description: string;
  startTime: number;
  endTime: number;
  totalPoints: number;
  points: number;
  rank: number;
  tier: number;
  tierName: string;
};

type PointsData = {
  allTimePoints: number;
  allTimeRank: number;
  allTimeTier: number;
  allTimeTierName: string;
  epochs: EpochData[];
};

type AirdropData = {
  points: PointsData | null;
  inkAmount: string | null;
  totalVolume: number | null;
  volumeByProduct: VolumeByProduct[] | null;
  errors: string[];
};

export type { EpochData, PointsData, AirdropData };

type AirdropStore = {
  address: string;
  airdropData: AirdropData | null;
  isLoading: boolean;
  error: string | null;

  manualPoints: number;
  dailyVolumeM: number;
  weeksOfFarm: number;
  inkFdv: number;
  airdropPct: number;

  setAddress: (address: string) => void;
  setAirdropData: (data: AirdropData) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setManualPoints: (pts: number) => void;
  setDailyVolumeM: (vol: number) => void;
  setWeeksOfFarm: (weeks: number) => void;
  setInkFdv: (fdv: number) => void;
  setAirdropPct: (pct: number) => void;
  reset: () => void;
};

const INITIAL_STATE = {
  address: "",
  airdropData: null,
  isLoading: false,
  error: null,
  manualPoints: 1000,
  dailyVolumeM: 500,
  weeksOfFarm: 20,
  inkFdv: 1_000_000_000,
  airdropPct: 8,
};

export const useAirdropStore = create<AirdropStore>((set) => ({
  ...INITIAL_STATE,
  setAddress: (address) => set({ address }),
  setAirdropData: (airdropData) =>
    set({ airdropData, isLoading: false, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  setManualPoints: (manualPoints) => set({ manualPoints }),
  setDailyVolumeM: (dailyVolumeM) => set({ dailyVolumeM }),
  setWeeksOfFarm: (weeksOfFarm) => set({ weeksOfFarm }),
  setInkFdv: (inkFdv) => set({ inkFdv }),
  setAirdropPct: (airdropPct) => set({ airdropPct }),
  reset: () => set(INITIAL_STATE),
}));

// ─── Computed selectors ───────────────────────────────────────────────────────

export function computeSimulation(state: {
  manualPoints: number;
  dailyVolumeM: number;
  weeksOfFarm: number;
  inkFdv: number;
  airdropPct: number;
}) {
  const weeklyPts = volumeToWeeklyPoints(state.dailyVolumeM);
  const estimatedS2Points = weeklyPts * state.weeksOfFarm;
  const totalPoolWithFarming =
    TOTAL_POINTS_POOL + estimatedS2Points - 7_620_000;
  const yourPoints = state.manualPoints;
  const shareOfPool =
    totalPoolWithFarming > 0 ? yourPoints / totalPoolWithFarming : 0;

  const pctDecimal = state.airdropPct / 100;
  const airdropValue = shareOfPool * pctDecimal * state.inkFdv;
  const dollarPerPoint =
    totalPoolWithFarming > 0
      ? (pctDecimal * state.inkFdv) / totalPoolWithFarming
      : 0;

  const scenarios = (
    Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>
  ).map((key) => {
    const s = SCENARIOS[key];
    const scenarioValue = shareOfPool * s.pct * state.inkFdv;
    const scenarioDpp =
      totalPoolWithFarming > 0
        ? (s.pct * state.inkFdv) / totalPoolWithFarming
        : 0;
    return {
      key,
      label: s.label,
      pct: s.pct,
      color: s.color,
      airdropValue: scenarioValue,
      dollarPerPoint: scenarioDpp,
    };
  });

  return {
    weeklyPts,
    estimatedS2Points,
    totalPoolWithFarming,
    shareOfPool,
    airdropValue,
    dollarPerPoint,
    scenarios,
  };
}
