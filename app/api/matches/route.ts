import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { withTransientRetry } from "@/lib/api/withTransientRetry";
import { NADO_MATCHES_SERVICE_URL } from "@/lib/nado";
import {
  ArchiveMatchesResponseSchema,
  MatchesQueryRequestSchema,
} from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

type ErrResponse = { error: string };

export async function POST(
  request: NextRequest,
): Promise<NextResponse<z.infer<typeof ArchiveMatchesResponseSchema> | ErrResponse>> {
  try {
    const serviceSecret = process.env.SERVICE_SECRET;
    if (!serviceSecret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const bodyResult = MatchesQueryRequestSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json({ error: "Invalid matches request body" }, { status: 400 });
    }

    if (!NADO_MATCHES_SERVICE_URL) {
      return NextResponse.json(
        { error: "Matches service not configured" },
        { status: 503 },
      );
    }

    const response = await withTransientRetry(
      () =>
        fetch(`${NADO_MATCHES_SERVICE_URL}/matches`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Service-Secret": serviceSecret,
          },
          body: JSON.stringify(bodyResult.data),
          signal: AbortSignal.timeout(18_000),
          cache: "no-store",
        }),
      { maxAttempts: 1 },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Matches service request failed" },
        { status: response.status },
      );
    }

    const raw: unknown = await response.json();
    const parsed = parseArchiveJson(ArchiveMatchesResponseSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "Invalid matches response from service" },
        { status: 502 },
      );
    }

    return NextResponse.json(parsed.data);
  } catch (e) {
    return categorizedErrorResponse(e, "[api/matches]");
  }
}
