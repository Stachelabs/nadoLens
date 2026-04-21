import { NADO_ARCHIVE_REST } from "@/lib/nado";
import {
  AccountSnapshotsRequestSchema,
  AccountSnapshotsResponseSchema,
} from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { withArchiveRetry } from "@/lib/archiveRetry";
import { cacheKey, hashParams, redis } from "@/lib/redis";
import { z } from "zod";

export const dynamic = "force-dynamic";

type ErrResponse = { error: string };

// Floor to nearest 5-minute bucket so repeated loads within a window hit cache
function timestampBucket(): number {
  return Math.floor(Date.now() / 1000 / 300) * 300;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<z.infer<typeof AccountSnapshotsResponseSchema> | ErrResponse>> {
  const rawBody: unknown = await request.json().catch(() => null);
  const bodyResult = AccountSnapshotsRequestSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return NextResponse.json({ error: "Invalid snapshots request body" }, { status: 400 });
  }

  const { subaccounts, isolated } = bodyResult.data;
  const timestamps = [Math.floor(Date.now() / 1000)];

  const key = cacheKey(
    "snapshots",
    hashParams({ subaccounts: [...subaccounts].sort(), isolated, bucket: timestampBucket() }),
  );

  type OkResponse = z.infer<typeof AccountSnapshotsResponseSchema>;

  try {
    const cached = await redis.get<OkResponse>(key);
    if (cached !== null) {
      const revalidated = AccountSnapshotsResponseSchema.safeParse(cached);
      if (revalidated.success) return NextResponse.json(revalidated.data);
    }
  } catch {
    // Cache unavailable — proceed to Archive
  }

  const archiveBody: Record<string, unknown> = {
    account_snapshots: {
      subaccounts,
      timestamps,
      active: true,
      ...(isolated !== undefined ? { isolated } : {}),
    },
  };

  const response = await withArchiveRetry(
    () =>
      fetch(NADO_ARCHIVE_REST, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip, br, deflate",
        },
        body: JSON.stringify(archiveBody),
        cache: "no-store",
      }),
    { maxAttempts: 5, baseDelayMs: 400, maxDelayMs: 30_000 },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: "Archive snapshots request failed" },
      { status: response.status },
    );
  }

  const raw: unknown = await response.json();
  const parsed = parseArchiveJson(AccountSnapshotsResponseSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid snapshots response from Archive" },
      { status: 502 },
    );
  }

  try {
    await redis.set(key, parsed.data, { ex: 300 });
  } catch {
    // Cache write failure is non-fatal
  }

  return NextResponse.json(parsed.data);
}
