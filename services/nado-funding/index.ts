// services/nado-funding/index.ts
import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const ARCHIVE_URL = process.env.NADO_ARCHIVE_REST ?? "https://archive.prod.nado.xyz/v1";
const GATEWAY_URL = process.env.NADO_GATEWAY_REST ?? "https://gateway.prod.nado.xyz/v1";
const SERVICE_SECRET = process.env.SERVICE_SECRET ?? "";

const redis = Redis.fromEnv();

let redisWrites = 0;
let redisErrors = 0;
let archiveFetches = 0;
let cacheHits = 0;

type FundingBody = {
  subaccount: string;
  product_ids: number[];
  limit: number;
  max_idx?: string;
  no_cache?: boolean;
};

function cacheKey(body: FundingBody): string {
  const { no_cache: _, ...hashBody } = body;
  const hash = createHash("sha256")
    .update(JSON.stringify(hashBody))
    .digest("hex")
    .slice(0, 16);
  return `nado:funding:${hash}`;
}

// ─── Positions proxy (migrated from app/api/wallet/[address], Vercel had no
// static IP / no rate-limit lift / zero caching / zero retry on this route) ──

type PositionsQuery = "subaccount_info" | "subaccount_orders" | "isolated_positions" | "orders";

type PositionsBody = {
  query: PositionsQuery;
  subaccount?: string;
  sender?: string;
  product_ids?: number[];
  no_cache?: boolean;
};

// Weights per docs/api/NADO_RATE_LIMITS.md "Gateway Queries — Weights" table.
// `subaccount_orders` isn't a distinct row in that table — treated as the same
// basic per-subaccount cost as subaccount_info (conservative, not confirmed).
function positionsWeight(body: PositionsBody): number {
  switch (body.query) {
    case "subaccount_info":
      return 2;
    case "subaccount_orders":
      return 2;
    case "isolated_positions":
      return 10;
    case "orders":
      return 2 * (body.product_ids?.length ?? 1);
  }
}

function positionsCacheKey(body: PositionsBody): string {
  const { no_cache: _, ...hashBody } = body;
  const hash = createHash("sha256")
    .update(JSON.stringify(hashBody))
    .digest("hex")
    .slice(0, 16);
  return `nado:positions:${hash}`;
}

function positionsGatewayBody(body: PositionsBody): Record<string, unknown> {
  if (body.query === "orders") {
    return { type: "orders", sender: body.sender, product_ids: body.product_ids };
  }
  return { type: body.query, subaccount: body.subaccount };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Token bucket rate limiter ────────────────────────────────────────────────

// Nado granted a rate-limit lift on this service's static egress IP
// (209.71.106.95): 2000 weight/10s, 12000 weight/min, up from the 400/10s base
// tier. Budgeted at ~50% of the new ceiling — deliberate headroom for
// concurrent devices/users, not maxing out the lift for a single session.
const RATE_BUDGET = 1000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_WAIT_MS = 8_000;
const RATE_QUEUED_THRESHOLD_MS = 2_000;
const FUNDING_WEIGHT = 5;

type WeightEntry = { ts: number; weight: number };
const weightLog: WeightEntry[] = [];

function evictStale(now: number): void {
  const cutoff = now - RATE_WINDOW_MS;
  while (weightLog.length > 0 && weightLog[0]!.ts < cutoff) {
    weightLog.shift();
  }
}

function currentWeight(): number {
  let total = 0;
  for (const e of weightLog) total += e.weight;
  return total;
}

async function acquireWeight(weight: number): Promise<{ waited: number }> {
  const start = Date.now();
  const deadline = start + RATE_MAX_WAIT_MS;

  while (true) {
    const now = Date.now();
    evictStale(now);

    if (currentWeight() + weight <= RATE_BUDGET) {
      weightLog.push({ ts: now, weight });
      return { waited: now - start };
    }

    if (now >= deadline) {
      weightLog.push({ ts: now, weight });
      console.warn(`[nado-funding] Rate limiter: max wait exceeded, proceeding anyway (weight=${weight})`);
      return { waited: now - start };
    }

    const oldest = weightLog[0];
    const waitUntil = oldest ? oldest.ts + RATE_WINDOW_MS : now + 100;
    const waitMs = Math.min(waitUntil - now + 10, deadline - now, 500);
    if (waitMs > 0) await sleep(waitMs);
  }
}

// ─── Archive fetch with retry ─────────────────────────────────────────────────

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
      archiveFetches++;
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

// ─── Gateway fetch with retry (positions proxy) ───────────────────────────────

async function fetchGatewayWithRetry(
  gatewayBody: Record<string, unknown>,
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
      archiveFetches++;
      const res = await fetch(`${GATEWAY_URL}/query`, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip, br, deflate",
        },
        body: JSON.stringify(gatewayBody),
      });

      if (res.status < 500 && res.status !== 429) return res;

      if (res.status >= 500 && attempt >= 1) {
        console.warn(`[nado-funding] Gateway 5xx after ${attempt + 1} attempts — circuit break`);
        return res;
      }

      last = res;
      console.warn(`[nado-funding] Gateway retry ${attempt + 1}/${maxAttempts} — status ${res.status}`);
    } catch (e) {
      lastError = e;
      const reason = e instanceof Error ? e.message : "unknown";
      console.warn(`[nado-funding] Gateway retry ${attempt + 1}/${maxAttempts} — ${reason}`);
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

// ─── Server ───────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      const mem = process.memoryUsage();
      let redisOk = false;
      try { await redis.ping(); redisOk = true; } catch { /* health check only */ }
      evictStale(Date.now());
      return Response.json({
        ok: true,
        memory_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        redis_ok: redisOk,
        redis_writes: redisWrites,
        redis_errors: redisErrors,
        rate_weight_used: Math.round(currentWeight()),
        rate_budget: RATE_BUDGET,
        archive_fetches: archiveFetches,
        cache_hits: cacheHits,
      });
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
      const responseHeaders: Record<string, string> = {};

      if (!body.no_cache) {
        try {
          const cached = await redis.get<unknown>(key);
          if (cached !== null) {
            cacheHits++;
            return Response.json(cached, {
              headers: { "X-Cache": "HIT" },
            });
          }
        } catch (err) {
          redisErrors++;
          const msg = err instanceof Error ? err.message : "unknown";
          console.error(`[nado-funding] Redis GET failed: ${msg}`);
        }
      }

      const { waited } = await acquireWeight(FUNDING_WEIGHT);
      if (waited >= RATE_QUEUED_THRESHOLD_MS) {
        responseHeaders["X-NadoLens-Queued"] = "true";
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
        await redis.set(key, data, { ex: 3_600 });
        redisWrites++;
      } catch (err) {
        redisErrors++;
        const msg = err instanceof Error ? err.message : "unknown";
        console.error(`[nado-funding] Redis SET failed: ${msg}`);
      }

      return Response.json(data, {
        headers: { "X-Cache": "MISS", ...responseHeaders },
      });
    }

    if (req.method === "POST" && url.pathname === "/positions") {
      if (SERVICE_SECRET && req.headers.get("X-Service-Secret") !== SERVICE_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      let body: PositionsBody;
      try {
        body = (await req.json()) as PositionsBody;
      } catch {
        return Response.json({ error: "Invalid request body" }, { status: 400 });
      }

      const key = positionsCacheKey(body);
      const responseHeaders: Record<string, string> = {};

      if (!body.no_cache) {
        try {
          const cached = await redis.get<unknown>(key);
          if (cached !== null) {
            cacheHits++;
            return Response.json(cached, { headers: { "X-Cache": "HIT" } });
          }
        } catch (err) {
          redisErrors++;
          const msg = err instanceof Error ? err.message : "unknown";
          console.error(`[nado-funding] Redis GET failed (positions): ${msg}`);
        }
      }

      const weight = positionsWeight(body);
      const { waited } = await acquireWeight(weight);
      if (waited >= RATE_QUEUED_THRESHOLD_MS) {
        responseHeaders["X-NadoLens-Queued"] = "true";
      }

      let gatewayRes: Response;
      try {
        gatewayRes = await fetchGatewayWithRetry(positionsGatewayBody(body), req.signal);
      } catch {
        return Response.json(
          { error: "Gateway temporarily unavailable" },
          { status: 502 },
        );
      }

      if (!gatewayRes.ok) {
        return new Response(await gatewayRes.text(), {
          status: gatewayRes.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data: unknown = await gatewayRes.json();

      // Short TTL — live position/order data on a 6-12s client poll cadence,
      // unlike funding's long-TTL interest/funding cache above. Just enough to
      // dedupe near-simultaneous polls across multiple open tabs/users.
      try {
        await redis.set(key, data, { ex: 4 });
        redisWrites++;
      } catch (err) {
        redisErrors++;
        const msg = err instanceof Error ? err.message : "unknown";
        console.error(`[nado-funding] Redis SET failed (positions): ${msg}`);
      }

      return Response.json(data, {
        headers: { "X-Cache": "MISS", ...responseHeaders },
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`nado-funding listening on port ${server.port}`);
