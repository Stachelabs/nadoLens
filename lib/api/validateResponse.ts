import { z } from "zod";

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
