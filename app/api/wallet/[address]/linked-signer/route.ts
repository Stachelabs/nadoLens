import { NADO_GATEWAY_REST } from "@/lib/nado";
import { LinkedSignerDataSchema } from "@/lib/schemas/nado";
import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  subaccounts: z.string().regex(/^0x[a-fA-F0-9,]+$/),
});

const GatewayResponseSchema = z.object({
  status: z.literal("success"),
  data: LinkedSignerDataSchema,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    await params;
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      subaccounts: url.searchParams.get("subaccounts") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid subaccounts parameter" },
        { status: 400 },
      );
    }

    const subaccountList = parsed.data.subaccounts.split(",").filter(Boolean);
    const signers: Record<string, string> = {};

    for (const sub of subaccountList) {
      try {
        const res = await fetch(
          `${NADO_GATEWAY_REST}/query?type=linked_signer&subaccount=${sub}`,
          {
            headers: { "Accept-Encoding": "gzip, br, deflate" },
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (!res.ok) {
          signers[sub] = "0x0000000000000000000000000000000000000000";
          continue;
        }

        const raw: unknown = await res.json();
        const validated = GatewayResponseSchema.safeParse(raw);

        if (validated.success) {
          signers[sub] = validated.data.data.linked_signer;
        } else {
          signers[sub] = "0x0000000000000000000000000000000000000000";
        }
      } catch {
        signers[sub] = "0x0000000000000000000000000000000000000000";
      }
    }

    return NextResponse.json({ signers });
  } catch (e) {
    return categorizedErrorResponse(e, "[api/wallet/linked-signer]");
  }
}
