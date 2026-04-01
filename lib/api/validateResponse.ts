import { z } from "zod";
import { GatewayResponseSchema } from "@/lib/schemas/nado";

/**
 * Standard pattern for Next.js route handlers calling Nado Archive / Gateway:
 * parse JSON → Zod safeParse → 502 if invalid.
 */
export function parseArchiveJson<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
): { ok: true; data: z.infer<T> } | { ok: false } {
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false };
  return { ok: true, data: result.data };
}

/**
 * Parse Gateway v1 envelope and preserve upstream failure messages.
 */
export function parseGatewayJson<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; kind: "invalid" }
  | { ok: false; kind: "gateway_failure"; error: string; error_code?: number } {
  const envelope = GatewayResponseSchema(schema).safeParse(raw);
  if (!envelope.success) return { ok: false, kind: "invalid" };

  const { status, data, error, error_code } = envelope.data;
  if (status === "failure") {
    return {
      ok: false,
      kind: "gateway_failure",
      error: error ?? "Gateway query failed",
      error_code,
    };
  }

  if (!data) return { ok: false, kind: "invalid" };
  return { ok: true, data };
}
