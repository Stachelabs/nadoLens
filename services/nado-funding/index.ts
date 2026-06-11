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

async function fetchWithRetry(
  body: FundingBody,
  callerSignal?: AbortSignal,
): Promise<Response> {
  const maxAttempts = 4;
  const baseDelayMs = 400;
  const maxDelayMs = 5_000;
  const DEADLINE_MS = 14_000;
  const deadline = Date.now() + DEADLINE_MS;
  let last: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && Date.now() >= deadline) break;
    if (callerSignal?.aborted) break;

    const remainingMs = Math.max(deadline - Date.now(), 1_000);
    const perAttemptTimeout = Math.min(remainingMs, 8_000);

    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), perAttemptTimeout);
    callerSignal?.addEventListener("abort", () => ac.abort(), { once: true });

    try {
      const res = await fetch(ARCHIVE_URL, {
        method: "POST",
        signal: ac.signal,
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

      if (res.status < 500 && res.status !== 429) return res;

      if (res.status >= 500 && attempt >= 1) {
        console.warn(`[nado-funding] Archive 5xx after ${attempt + 1} attempts — circuit break`);
        return res;
      }

      last = res;
      console.warn(`[nado-funding] Archive retry ${attempt + 1}/${maxAttempts} — status ${res.status}`);
    } catch (e) {
      lastError = e;
      const reason = e instanceof Error ? e.message : "unknown";
      console.warn(`[nado-funding] Archive retry ${attempt + 1}/${maxAttempts} — ${reason}`);
    } finally {
      clearTimeout(tid);
    }

    if (attempt < maxAttempts - 1 && Date.now() < deadline) {
      const ra = last?.headers.get("Retry-After");
      const retryAfterMs = ra ? Math.min(parseInt(ra, 10) * 1000, maxDelayMs) : 0;
      const jitter = 1 + Math.random() * 0.3;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) * jitter + retryAfterMs,
        maxDelayMs,
      );
      await sleep(Math.min(delay, deadline - Date.now()));
    }
  }

  if (last) return last;
  throw lastError;
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

      let archiveRes: Response;
      try {
        archiveRes = await fetchWithRetry(body, req.signal);
      } catch {
        return Response.json(
          { error: "Archive temporarily unavailable" },
          { status: 502 },
        );
      }

      if (!archiveRes.ok) {
        return new Response(await archiveRes.text(), {
          status: archiveRes.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data: unknown = await archiveRes.json();

      try {
        await redis.set(key, data, { ex: 21_600 });
      } catch {
        // Cache write failure is non-fatal
      }

      return Response.json(data, { headers: { "X-Cache": "MISS" } });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`nado-funding listening on port ${server.port}`);
