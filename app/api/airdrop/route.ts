import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { withArchiveRetry } from "@/lib/archiveRetry";
import { NADO_ARCHIVE_REST } from "@/lib/nado";
import { fromX18BigInt } from "@/types/nado";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// ─── nado_points response ────────────────────────────────────────────────────

const EpochSchema = z.object({
  epoch: z.number(),
  description: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  total_points: z.string(),
  points: z.string(),
  rank: z.number(),
  tier: z.number(),
});

const NadoPointsResponseSchema = z.object({
  points_per_epoch: z.array(EpochSchema),
  all_time_points: z.object({
    points: z.string(),
    rank: z.number(),
    tier: z.number(),
  }),
});

// ─── account_snapshots response ──────────────────────────────────────────────

const SnapshotEventSchema = z.object({
  product_id: z.number(),
  quote_volume_cumulative: z.string().optional(),
});

const AccountSnapshotSchema = z.object({
  snapshots: z.record(z.string(), z.record(z.string(), z.array(SnapshotEventSchema))),
});

// ─── ink_airdrop response (future $INK token distribution) ───────────────────

const InkAirdropResponseSchema = z.object({
  amount: z.string(),
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function addressToSubaccount(address: string): string {
  const addr = address.toLowerCase().replace("0x", "");
  const nameHex = Buffer.from("default").toString("hex").padEnd(24, "0");
  return `0x${addr}${nameHex}`;
}

const ARCHIVE_HEADERS = {
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip",
};

const TIER_NAMES: Record<number, string> = {
  1: "Breeze",
  2: "Gust",
  3: "Wind",
  4: "Storm",
  5: "Tornado",
};

// ─── response type ───────────────────────────────────────────────────────────

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

type AirdropResponse = {
  points: {
    allTimePoints: number;
    allTimeRank: number;
    allTimeTier: number;
    allTimeTierName: string;
    epochs: EpochData[];
  } | null;
  inkAmount: string | null;
  totalVolume: number | null;
  volumeByProduct: { productId: number; volume: number }[] | null;
  errors: string[];
};

// ─── route ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const addressResult = AddressSchema.safeParse(searchParams.get("address"));
    if (!addressResult.success) {
      return NextResponse.json(
        { error: "Invalid Ethereum address" },
        { status: 400 },
      );
    }
    const address = addressResult.data;
    const subaccount = addressToSubaccount(address);
    const errors: string[] = [];

    const [pointsResult, snapshotResult, inkResult] = await Promise.allSettled([
      withArchiveRetry(() =>
        fetch(NADO_ARCHIVE_REST, {
          method: "POST",
          headers: ARCHIVE_HEADERS,
          body: JSON.stringify({ nado_points: { address } }),
          signal: AbortSignal.timeout(10_000),
        }),
      ),
      withArchiveRetry(() =>
        fetch(NADO_ARCHIVE_REST, {
          method: "POST",
          headers: ARCHIVE_HEADERS,
          body: JSON.stringify({
            account_snapshots: {
              subaccounts: [subaccount],
              timestamps: [Math.floor(Date.now() / 1000)],
            },
          }),
          signal: AbortSignal.timeout(10_000),
        }),
      ),
      withArchiveRetry(() =>
        fetch(NADO_ARCHIVE_REST, {
          method: "POST",
          headers: ARCHIVE_HEADERS,
          body: JSON.stringify({ ink_airdrop: { address } }),
          signal: AbortSignal.timeout(10_000),
        }),
      ),
    ]);

    // ── nado_points ──────────────────────────────────────────────────────────

    let points: AirdropResponse["points"] = null;

    if (pointsResult.status === "fulfilled" && pointsResult.value.ok) {
      const raw: unknown = await pointsResult.value.json();
      const parsed = NadoPointsResponseSchema.safeParse(raw);
      if (parsed.success) {
        const { all_time_points, points_per_epoch } = parsed.data;
        points = {
          allTimePoints: fromX18BigInt(all_time_points.points),
          allTimeRank: all_time_points.rank,
          allTimeTier: all_time_points.tier,
          allTimeTierName: TIER_NAMES[all_time_points.tier] ?? "Unknown",
          epochs: points_per_epoch
            .filter((e) => e.points !== "0")
            .map((e) => ({
              epoch: e.epoch,
              description: e.description,
              startTime: Number(e.start_time),
              endTime: Number(e.end_time),
              totalPoints: fromX18BigInt(e.total_points),
              points: fromX18BigInt(e.points),
              rank: e.rank,
              tier: e.tier,
              tierName: TIER_NAMES[e.tier] ?? "Unknown",
            })),
        };
      } else {
        errors.push("nado_points: invalid response shape");
      }
    } else {
      errors.push(
        `nado_points: ${pointsResult.status === "rejected" ? "network error" : `status ${pointsResult.value.status}`}`,
      );
    }

    // ── account_snapshots (volume) ───────────────────────────────────────────

    let totalVolume: number | null = null;
    let volumeByProduct: { productId: number; volume: number }[] | null = null;

    if (snapshotResult.status === "fulfilled" && snapshotResult.value.ok) {
      const raw: unknown = await snapshotResult.value.json();
      const parsed = AccountSnapshotSchema.safeParse(raw);
      if (parsed.success) {
        const volumeMap = new Map<number, number>();
        for (const tsMap of Object.values(parsed.data.snapshots)) {
          for (const events of Object.values(tsMap)) {
            for (const ev of events) {
              if (ev.quote_volume_cumulative) {
                const vol = fromX18BigInt(ev.quote_volume_cumulative);
                if (Number.isFinite(vol) && vol >= 0) {
                  const existing = volumeMap.get(ev.product_id) ?? 0;
                  if (vol > existing) volumeMap.set(ev.product_id, vol);
                }
              }
            }
          }
        }
        volumeByProduct = [...volumeMap.entries()].map(([productId, volume]) => ({
          productId,
          volume,
        }));
        totalVolume = volumeByProduct.reduce((sum, p) => sum + p.volume, 0);
      } else {
        errors.push("account_snapshots: invalid response shape");
      }
    } else {
      errors.push(
        `account_snapshots: ${snapshotResult.status === "rejected" ? "network error" : `status ${snapshotResult.value.status}`}`,
      );
    }

    // ── ink_airdrop (future $INK token) ──────────────────────────────────────

    let inkAmount: string | null = null;

    if (inkResult.status === "fulfilled" && inkResult.value.ok) {
      const raw: unknown = await inkResult.value.json();
      const parsed = InkAirdropResponseSchema.safeParse(raw);
      if (parsed.success) {
        inkAmount = parsed.data.amount;
      } else {
        errors.push("ink_airdrop: invalid response shape");
      }
    } else {
      errors.push(
        `ink_airdrop: ${inkResult.status === "rejected" ? "network error" : `status ${inkResult.value.status}`}`,
      );
    }

    // ── response ─────────────────────────────────────────────────────────────

    if (points === null && totalVolume === null && inkAmount === null) {
      return NextResponse.json(
        { error: "All Archive calls failed", details: errors },
        { status: 502 },
      );
    }

    const response: AirdropResponse = {
      points,
      inkAmount,
      totalVolume,
      volumeByProduct,
      errors,
    };

    return NextResponse.json(response);
  } catch (e) {
    return categorizedErrorResponse(e, "airdrop");
  }
}
