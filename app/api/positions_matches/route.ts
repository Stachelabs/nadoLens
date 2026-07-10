import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { withTransientRetry } from "@/lib/api/withTransientRetry";
import { NADO_MATCHES_SERVICE_URL } from "@/lib/nado";
import {
  ArchiveMatchesResponseSchema,
  PositionMatchesRequestSchema,
} from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { z } from "zod";

export const dynamic = "force-dynamic";

type ErrResponse = { error: string };
type MatchesResponse = z.infer<typeof ArchiveMatchesResponseSchema>;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<MatchesResponse | ErrResponse>> {
  try {
    const serviceSecret = process.env.SERVICE_SECRET;
    if (!serviceSecret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const bodyResult = PositionMatchesRequestSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json({ error: "Invalid position matches request body" }, { status: 400 });
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
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        }),
      // maxAttempts: 2 (was 3) — nado-matches already retries Archive
      // internally (fetchWithRetry, up to 4 attempts), so retrying a
      // definitive Archive/rate-limiter response here just re-enters the
      // Fly service's rate limiter and re-triggers its own 4-attempt retry,
      // multiplying real upstream calls up to 12x during exactly the moment
      // (an Archive outage/429 storm) that's most harmful. Kept at 2, not 1,
      // to preserve one retry against a DIFFERENT failure class this layer
      // still needs to cover: the Fly service itself being transiently
      // unreachable (deploy rolling restart, cold start, network blip) —
      // nado-matches's own internal retry can't protect against that since
      // it never runs if the process/network path itself is down.
      { maxAttempts: 2 },
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
    return categorizedErrorResponse(e, "[api/positions_matches]");
  }
}
