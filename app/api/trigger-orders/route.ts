import { NADO_TRIGGER_REST } from "@/lib/nado";
import { TriggerListOrdersResponseSchema } from "@/lib/schemas/nado";
import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RequestBodySchema = z.object({
  sender: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  recvTime: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  productIds: z.array(z.number()).optional(),
  statusTypes: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const parsed = RequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { sender, recvTime, signature, productIds, statusTypes } = parsed.data;

    const triggerBody: Record<string, unknown> = {
      type: "list_trigger_orders",
      tx: { sender, recvTime },
      signature,
      ...(productIds && productIds.length > 0 && { product_ids: productIds }),
      ...(statusTypes && statusTypes.length > 0 && { status_types: statusTypes }),
    };

    const response = await fetch(`${NADO_TRIGGER_REST}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, br, deflate",
      },
      body: JSON.stringify(triggerBody),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Trigger service error: ${response.status}`, detail: text },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

    const raw: unknown = await response.json();

    if (typeof raw === "object" && raw !== null && "status" in raw && (raw as Record<string, unknown>).status === "failure") {
      const fail = raw as Record<string, unknown>;
      const msg = typeof fail.error === "string" ? fail.error : "Trigger service rejected request";
      return NextResponse.json(
        { error: msg, error_code: fail.error_code },
        { status: 400 },
      );
    }

    const validated = TriggerListOrdersResponseSchema.safeParse(raw);
    if (!validated.success) {
      console.error("[api/trigger-orders] validation failed", validated.error.issues);
      return NextResponse.json(
        { error: "Invalid trigger service response" },
        { status: 502 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (e) {
    return categorizedErrorResponse(e, "[api/trigger-orders]");
  }
}
