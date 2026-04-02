import { NADO_ARCHIVE_REST } from "@/lib/nado";
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
  const rawBody: unknown = await request.json().catch(() => null);
  const bodyResult = InterestAndFundingRequestSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return NextResponse.json({ error: "Invalid funding request body" }, { status: 400 });
  }

  const response = await fetch(NADO_ARCHIVE_REST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip, br, deflate",
    },
    body: JSON.stringify({
      interest_and_funding: {
        subaccount: bodyResult.data.subaccount,
        product_ids: bodyResult.data.product_ids,
        limit: bodyResult.data.limit,
        ...(bodyResult.data.max_idx ? { max_idx: bodyResult.data.max_idx } : {}),
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Archive funding request failed" },
      { status: response.status },
    );
  }

  const raw: unknown = await response.json();
  const parsed = parseArchiveJson(InterestAndFundingPaymentsResponseSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid funding response from Archive" },
      { status: 502 },
    );
  }

  return NextResponse.json(parsed.data);
}
