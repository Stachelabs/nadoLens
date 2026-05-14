import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const StatusResponseSchema = z.object({
  status: z.enum(["online", "degraded", "offline"]),
  services: z.object({
    api: z.boolean(),
    wsProxy: z.boolean(),
    nado: z.boolean(),
  }),
  timestamp: z.string(),
});

type StatusResponse = z.infer<typeof StatusResponseSchema>;

const NADO_GATEWAY = "https://gateway.prod.nado.xyz/v1";
const NADO_CACHE_TTL = 5 * 60 * 1000;

let nadoCache: { ok: boolean; ts: number } = { ok: true, ts: 0 };

async function pingWithTimeout(
  url: string,
  ms: number,
  acceptAnyResponse = false,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return acceptAnyResponse ? true : res.ok;
  } catch {
    return false;
  }
}

async function checkNado(): Promise<boolean> {
  if (Date.now() - nadoCache.ts < NADO_CACHE_TTL) return nadoCache.ok;
  // Gateway returns 403 for non-EU IPs — any response means server is up
  const ok = await pingWithTimeout(NADO_GATEWAY, 5000, true);
  nadoCache = { ok, ts: Date.now() };
  return ok;
}

export async function GET(): Promise<NextResponse<StatusResponse | { error: string }>> {
  try {
    const wsProxyUrl = process.env.NEXT_PUBLIC_WS_PROXY_URL;

    const [wsProxyOk, nadoOk] = await Promise.all([
      wsProxyUrl ? pingWithTimeout(`${wsProxyUrl}/health`, 5000) : Promise.resolve(false),
      checkNado(),
    ]);

    const allUp = wsProxyOk && nadoOk;
    const allDown = !wsProxyOk && !nadoOk;

    const result: StatusResponse = {
      status: allDown ? "offline" : allUp ? "online" : "degraded",
      services: {
        api: true,
        wsProxy: wsProxyOk,
        nado: nadoOk,
      },
      timestamp: new Date().toISOString(),
    };

    const parsed = StatusResponseSchema.safeParse(result);
    if (!parsed.success) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
