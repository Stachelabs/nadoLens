import { NADO_ARCHIVE_REST } from "@/lib/nado";
import {
  ArchiveMatchesResponseSchema,
  MatchesQueryRequestSchema,
} from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { z } from "zod";

export const dynamic = "force-dynamic";

type ErrResponse = { error: string };

export async function POST(
  request: NextRequest,
): Promise<NextResponse<z.infer<typeof ArchiveMatchesResponseSchema> | ErrResponse>> {
  const rawBody: unknown = await request.json().catch(() => null);
  const bodyResult = MatchesQueryRequestSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return NextResponse.json({ error: "Invalid matches request body" }, { status: 400 });
  }

  const response = await fetch(NADO_ARCHIVE_REST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip, br, deflate",
    },
    body: JSON.stringify({
      matches: {
        subaccounts: bodyResult.data.subaccounts,
        limit: bodyResult.data.limit,
        isolated: bodyResult.data.isolated,
        ...(bodyResult.data.idx ? { idx: bodyResult.data.idx } : {}),
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Archive matches request failed" },
      { status: response.status },
    );
  }

  const raw: unknown = await response.json();
  const parsed = parseArchiveJson(ArchiveMatchesResponseSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid matches response from Archive" },
      { status: 502 },
    );
  }

  return NextResponse.json(parsed.data);
}
