import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { NADO_ARCHIVE_REST } from "@/lib/nado";
import { ArchiveSubaccountsResponseSchema } from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { withArchiveRetry } from "@/lib/archiveRetry";
import { cacheKey, redis } from "@/lib/redis";
import { isAddress } from "viem";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ address: string }>;
};

type OkResponse = z.infer<typeof ArchiveSubaccountsResponseSchema>;
type ErrResponse = { error: string };

export async function GET(
  _request: NextRequest,
  { params }: Props,
): Promise<NextResponse<OkResponse | ErrResponse>> {
  const { address } = await params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const key = cacheKey("subaccounts", address.toLowerCase());

  try {
    const cached = await redis.get<OkResponse>(key);
    if (cached !== null) {
      const revalidated = ArchiveSubaccountsResponseSchema.safeParse(cached);
      if (revalidated.success) return NextResponse.json(revalidated.data);
    }
  } catch {
    // Cache unavailable — proceed to Archive
  }

  try {
    const response = await withArchiveRetry(
      () =>
        fetch(NADO_ARCHIVE_REST, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip" },
          body: JSON.stringify({ subaccounts: { address } }),
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        }),
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Archive request failed" },
        { status: response.status },
      );
    }

    const raw: unknown = await response.json();
    const parsed = parseArchiveJson(ArchiveSubaccountsResponseSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "Invalid response from Archive" },
        { status: 502 },
      );
    }

    try {
      await redis.set(key, parsed.data, { ex: 300 });
    } catch {
      // Cache write failure is non-fatal
    }

    return NextResponse.json(parsed.data);
  } catch (e) {
    return categorizedErrorResponse(e, "[api/subaccounts]");
  }
}
