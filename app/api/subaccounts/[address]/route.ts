import { NADO_ARCHIVE_REST } from "@/lib/nado";
import { ArchiveSubaccountsResponseSchema } from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
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

  const response = await fetch(NADO_ARCHIVE_REST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip" },
    body: JSON.stringify({ subaccounts: { address } }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Archive request failed" },
      { status: response.status },
    );
  }

  const raw: unknown = await response.json();
  const result = ArchiveSubaccountsResponseSchema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid response from Archive" },
      { status: 502 },
    );
  }

  return NextResponse.json(result.data);
}
