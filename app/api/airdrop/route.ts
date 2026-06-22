import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { withArchiveRetry } from "@/lib/archiveRetry";
import { NADO_ARCHIVE_REST } from "@/lib/nado";
import { fromX18BigInt } from "@/types/nado";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const InkAirdropResponseSchema = z.object({
  amount: z.string(),
});

const SnapshotEventSchema = z.object({
  product_id: z.number(),
  quote_volume_cumulative: z.string().optional(),
});

const AccountSnapshotSchema = z.object({
  snapshots: z.record(z.string(), z.record(z.string(), z.array(SnapshotEventSchema))),
});

function addressToSubaccount(address: string): string {
  const addr = address.toLowerCase().replace("0x", "");
  const nameHex = Buffer.from("default").toString("hex").padEnd(24, "0");
  return `0x${addr}${nameHex}`;
}

type AirdropResponse = {
  inkAmount: string | null;
  totalVolume: number | null;
  volumeByProduct: { productId: number; volume: number }[] | null;
  errors: string[];
};

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

    const archiveHeaders = {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    };

    const [inkResult, snapshotResult] = await Promise.allSettled([
      withArchiveRetry(() =>
        fetch(NADO_ARCHIVE_REST, {
          method: "POST",
          headers: archiveHeaders,
          body: JSON.stringify({ ink_airdrop: { address } }),
          signal: AbortSignal.timeout(10_000),
        }),
      ),
      withArchiveRetry(() =>
        fetch(NADO_ARCHIVE_REST, {
          method: "POST",
          headers: archiveHeaders,
          body: JSON.stringify({
            account_snapshots: {
              subaccounts: [subaccount],
              timestamps: [Math.floor(Date.now() / 1000)],
            },
          }),
          signal: AbortSignal.timeout(10_000),
        }),
      ),
    ]);

    let inkAmount: string | null = null;
    let totalVolume: number | null = null;
    let volumeByProduct: { productId: number; volume: number }[] | null = null;

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

    if (inkAmount === null && totalVolume === null) {
      return NextResponse.json(
        { error: "Both Archive calls failed", details: errors },
        { status: 502 },
      );
    }

    const response: AirdropResponse = {
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
