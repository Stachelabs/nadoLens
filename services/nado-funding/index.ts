// services/nado-funding/index.ts
import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const ARCHIVE_URL = process.env.NADO_ARCHIVE_REST ?? "https://archive.prod.nado.xyz/v1";
const SERVICE_SECRET = process.env.SERVICE_SECRET ?? "";

const redis = Redis.fromEnv();

type FundingBody = {
  subaccount: string;
  product_ids: number[];
  limit: number;
  max_idx?: string;
};

function cacheKey(body: FundingBody): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 16);
  return `nado:funding:${hash}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(body: FundingBody): Promise<Response> {
  const maxAttempts = 4;
  const baseDelayMs = 350;
  const maxDelayMs = 8_000;
  let last!: Response;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(ARCHIVE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, br, deflate",
      },
      body: JSON.stringify({
        interest_and_funding: {
          subaccount: body.subaccount,
          product_ids: body.product_ids,
          limit: body.limit,
          ...(body.max_idx ? { max_idx: body.max_idx } : {}),
        },
      }),
    });

    if (res.status !== 429) return res;
    last = res;

    if (attempt < maxAttempts - 1) {
      const ra = res.headers.get("Retry-After");
      const retryAfterMs = ra ? Math.min(parseInt(ra, 10) * 1000, maxDelayMs) : 0;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + retryAfterMs, maxDelayMs);
      await sleep(delay);
    }
  }

  return last;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/funding") {
      if (SERVICE_SECRET && req.headers.get("X-Service-Secret") !== SERVICE_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      let body: FundingBody;
      try {
        body = (await req.json()) as FundingBody;
      } catch {
        return Response.json({ error: "Invalid request body" }, { status: 400 });
      }

      const key = cacheKey(body);

      try {
        const cached = await redis.get<unknown>(key);
        if (cached !== null) {
          return Response.json(cached, {
            headers: { "X-Cache": "HIT" },
          });
        }
      } catch {
        // Cache miss on error — proceed to Archive
      }

      const archiveRes = await fetchWithRetry(body);

      if (!archiveRes.ok) {
        return new Response(await archiveRes.text(), {
          status: archiveRes.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data: unknown = await archiveRes.json();

      try {
        await redis.set(key, data, { ex: 86_400 });
      } catch {
        // Cache write failure is non-fatal
      }

      return Response.json(data, { headers: { "X-Cache": "MISS" } });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`nado-funding listening on port ${server.port}`);
