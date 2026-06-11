import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { withTransientRetry } from "@/lib/api/withTransientRetry";
import { NADO_FUNDING_SERVICE_URL } from "@/lib/nado";
import {
  InterestAndFundingPaymentsResponseSchema,
  InterestAndFundingRequestSchema,
} from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { z } from "zod";

export const dynamic = "force-dynamic";

type ErrResponse = { error: string };

export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<z.infer<typeof InterestAndFundingPaymentsResponseSchema> | ErrResponse>
> {
  try {
    const serviceSecret = process.env.SERVICE_SECRET;
    if (!serviceSecret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const bodyResult = InterestAndFundingRequestSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json({ error: "Invalid funding request body" }, { status: 400 });
    }

    if (!NADO_FUNDING_SERVICE_URL) {
      return NextResponse.json(
        { error: "Funding service not configured" },
        { status: 503 },
      );
    }

    const response = await withTransientRetry(
      () =>
        fetch(`${NADO_FUNDING_SERVICE_URL}/funding`, {
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
        { error: "Funding service request failed" },
        { status: response.status },
      );
    }

    const raw: unknown = await response.json();
    const parsed = parseArchiveJson(InterestAndFundingPaymentsResponseSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "Invalid funding response from service" },
        { status: 502 },
      );
    }

    return NextResponse.json(parsed.data);
  } catch (e) {
    return categorizedErrorResponse(e, "[api/funding]");
  }
}
