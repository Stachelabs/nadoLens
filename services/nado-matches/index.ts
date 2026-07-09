// services/nado-matches/index.ts
//
// Merged service: Nado Archive matches proxy + WebSocket-to-SSE proxy
//
// POST /matches  — proxies to archive.prod.nado.xyz with Upstash Redis cache
// GET  /sse      — SSE stream; ?subaccount=0x... routes fill + position_change events
// GET  /health   — reports ws_connected, sse_clients, account_subs
//
// Deploy sequence (run manually after code changes):
//   1. fly secrets set NADO_SUBSCRIPTIONS_WS=wss://gateway.prod.nado.xyz/v1/subscribe \
//        -a nadolens-nado-matches   (if not already set)
//   2. cd services/nado-matches && fly deploy --ha=false
//   3. Verify: curl https://nadolens-nado-matches.fly.dev/health
//   4. Update Vercel env: NEXT_PUBLIC_WS_PROXY_URL=https://nadolens-nado-matches.fly.dev
//   5. fly apps destroy nadolens-ws-proxy   (after confirming zero traffic)

import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import { WebSocket } from "ws";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const ARCHIVE_URL =
  process.env.NADO_ARCHIVE_REST ?? "https://archive.prod.nado.xyz/v1";
const NADO_WS_URL =
  process.env.NADO_SUBSCRIPTIONS_WS ??
  "wss://gateway.prod.nado.xyz/v1/subscribe";
const SERVICE_SECRET = process.env.SERVICE_SECRET ?? "";
const PING_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

const redis = Redis.fromEnv();

// ─── Types ─────────────────────────────────────────────────────────────────────

type MatchesBody = {
  subaccounts: string[];
  limit: number;
  isolated: boolean | null;
  idx?: string;
  product_ids?: number[];
  /** When true, skip the Redis cache read (always fetch fresh from Archive). Cache is still written after. */
  no_cache?: boolean;
};

type SSEClient = {
  id: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  subaccount: string | null;
};

// ─── SSE routing state ─────────────────────────────────────────────────────────

const clients = new Map<string, SSEClient>();
// subaccount bytes32 → Set of SSE client IDs watching it
const accountClients = new Map<string, Set<string>>();
// Persists across WS reconnects — re-subscribed on every open event
const subscribedAccounts = new Set<string>();
let nextSubId = 10;
const encoder = new TextEncoder();

function broadcastToAll(raw: string) {
  const chunk = encoder.encode(`data: ${raw}\n\n`);
  for (const [id, client] of clients) {
    client.writer.write(chunk).catch(() => clients.delete(id));
  }
}

function routeToAccount(subaccount: string, raw: string) {
  const ids = accountClients.get(subaccount);
  if (!ids || ids.size === 0) return;
  const chunk = encoder.encode(`data: ${raw}\n\n`);
  for (const id of ids) {
    const client = clients.get(id);
    if (!client) {
      ids.delete(id);
      continue;
    }
    client.writer.write(chunk).catch(() => {
      clients.delete(id);
      ids.delete(id);
    });
  }
}

function handleMessage(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    broadcastToAll(raw);
    return;
  }

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "subaccount" in parsed &&
    typeof (parsed as Record<string, unknown>).subaccount === "string"
  ) {
    routeToAccount(
      (parsed as Record<string, unknown>).subaccount as string,
      raw,
    );
    return;
  }

  broadcastToAll(raw);
}

// ─── WebSocket connection to Nado Gateway ──────────────────────────────────────

let ws: WebSocket | null = null;
let wsConnected = false;

function subscribeAccount(subaccount: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      id: nextSubId++,
      method: "subscribe",
      stream: { type: "fill", subaccount },
    }),
  );
  ws.send(
    JSON.stringify({
      id: nextSubId++,
      method: "subscribe",
      stream: { type: "position_change", subaccount },
    }),
  );
  console.log(
    `[nado-matches] Subscribed fill+position_change for ${subaccount.slice(0, 10)}…`,
  );
}

function connect(attempt = 0): void {
  const socket = new WebSocket(NADO_WS_URL, {
    headers: { "Sec-WebSocket-Extensions": "permessage-deflate" },
  });
  ws = socket;

  socket.on("open", () => {
    wsConnected = true;
    attempt = 0;
    console.log(`[nado-matches] WS connected to ${NADO_WS_URL}`);

    // Re-subscribe all account streams after every reconnect
    for (const subaccount of subscribedAccounts) {
      subscribeAccount(subaccount);
    }

    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: 5, method: "ping" }));
      } else {
        clearInterval(pingInterval);
      }
    }, PING_INTERVAL_MS);

    socket.on("close", () => {
      clearInterval(pingInterval);
      wsConnected = false;
      ws = null;
      console.log(
        `[nado-matches] WS disconnected — reconnecting (attempt ${attempt + 1})`,
      );
      reconnect(attempt + 1);
    });
  });

  socket.on("message", (data) => {
    const raw = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    handleMessage(raw);
  });

  socket.on("error", (error: Error) => {
    console.error("[nado-matches] WS error:", error.message);
    wsConnected = false;
    ws = null;
    reconnect(attempt + 1);
  });
}

function reconnect(attempt: number): void {
  const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
  console.log(`[nado-matches] Reconnecting in ${delay}ms…`);
  setTimeout(() => connect(attempt), delay);
}

// ─── Redis observability counters ─────────────────────────────────────────────

let redisWrites = 0;
let redisErrors = 0;

// ─── Token bucket rate limiter ────────────────────────────────────────────────

// Nado granted a rate-limit lift on this service's static egress IP
// (209.71.106.68): 2000 weight/10s, 12000 weight/min, up from the 400/10s base
// tier. Budgeted at ~50% of the new ceiling — deliberate headroom for
// concurrent devices/users, not maxing out the lift for a single session.
const RATE_BUDGET = 1000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_WAIT_MS = 8_000;
const RATE_QUEUED_THRESHOLD_MS = 2_000;

type WeightEntry = { ts: number; weight: number };
const weightLog: WeightEntry[] = [];

function requestWeight(body: MatchesBody): number {
  const limit = Math.min(body.limit ?? 250, 500);
  const subs = Math.min(body.subaccounts?.length ?? 1, 50);
  return 2 + (limit * subs) / 10;
}

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
      console.warn(`[nado-matches] Rate limiter: max wait exceeded, proceeding anyway (weight=${weight})`);
      return { waited: now - start };
    }

    const oldest = weightLog[0];
    const waitUntil = oldest ? oldest.ts + RATE_WINDOW_MS : now + 100;
    const waitMs = Math.min(waitUntil - now + 10, deadline - now, 500);
    if (waitMs > 0) await sleep(waitMs);
  }
}

// ─── Matches proxy helpers ─────────────────────────────────────────────────────

function cacheKey(body: MatchesBody): string {
  // Exclude no_cache from the hash so no_cache:true and no_cache:false/undefined
  // share the same key — allowing cache bypass writes to benefit subsequent reads.
  const { no_cache: _, ...hashBody } = body;
  const hash = createHash("sha256")
    .update(JSON.stringify(hashBody))
    .digest("hex")
    .slice(0, 16);
  return `nado:matches:${hash}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  body: MatchesBody,
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
          matches: {
            subaccounts: body.subaccounts,
            limit: body.limit,
            isolated: body.isolated,
            ...(body.idx ? { idx: body.idx } : {}),
            ...(body.product_ids?.length
              ? { product_ids: body.product_ids }
              : {}),
          },
        }),
      });

      if (res.status < 500 && res.status !== 429) return res;

      if (res.status >= 500 && attempt >= 1) {
        console.warn(`[nado-matches] Archive 5xx after ${attempt + 1} attempts — circuit break`);
        return res;
      }

      last = res;
      console.warn(`[nado-matches] Archive retry ${attempt + 1}/${maxAttempts} — status ${res.status}`);
    } catch (e) {
      lastError = e;
      const reason = e instanceof Error ? e.message : "unknown";
      console.warn(`[nado-matches] Archive retry ${attempt + 1}/${maxAttempts} — ${reason}`);
    } finally {
      clearTimeout(tid);
    }

    if (attempt < maxAttempts - 1 && Date.now() < deadline) {
      const ra = last?.headers.get("Retry-After");
      const retryAfterMs = ra
        ? Math.min(parseInt(ra, 10) * 1000, maxDelayMs)
        : 0;
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

// ─── HTTP server ───────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      const mem = process.memoryUsage();
      evictStale(Date.now());
      let redisOk = false;
      try { await redis.ping(); redisOk = true; } catch { /* health check only */ }
      return Response.json({
        ok: true,
        ws_connected: wsConnected,
        sse_clients: clients.size,
        account_subs: subscribedAccounts.size,
        rate_weight_used: Math.round(currentWeight()),
        rate_budget: RATE_BUDGET,
        memory_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        redis_ok: redisOk,
        redis_writes: redisWrites,
        redis_errors: redisErrors,
      });
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      const id = crypto.randomUUID();
      const subaccount = url.searchParams.get("subaccount") ?? null;

      const { readable, writable } = new TransformStream<
        Uint8Array,
        Uint8Array
      >();
      const writer = writable.getWriter();

      clients.set(id, { id, writer, subaccount });
      console.log(
        `[nado-matches] SSE connected (${id}) sub=${subaccount?.slice(0, 10) ?? "none"}… total: ${clients.size}`,
      );

      if (subaccount) {
        if (!accountClients.has(subaccount)) {
          accountClients.set(subaccount, new Set());
        }
        accountClients.get(subaccount)!.add(id);

        if (!subscribedAccounts.has(subaccount)) {
          subscribedAccounts.add(subaccount);
          subscribeAccount(subaccount);
        }
      }

      writer.write(encoder.encode(": connected\n\n"));

      // Fly.io's edge proxy (double-hop, see `via` header) appears to idle-time
      // an HTTP/2 SSE stream around ~12-13s if no data frame is sent — Chrome
      // surfaces the resulting stream kill as ERR_HTTP2_PROTOCOL_ERROR. 8s
      // keeps real margin under that observed threshold.
      const heartbeat = setInterval(() => {
        writer.write(encoder.encode(": ping\n\n")).catch(() => {});
      }, 8_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        clients.delete(id);

        if (subaccount) {
          const ids = accountClients.get(subaccount);
          if (ids) {
            ids.delete(id);
            if (ids.size === 0) {
              accountClients.delete(subaccount);
              subscribedAccounts.delete(subaccount);
            }
          }
        }

        writer.close().catch(() => {});
        console.log(
          `[nado-matches] SSE disconnected (${id}) — total: ${clients.size}`,
        );
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          // NOTE: no `Connection` header — it's an HTTP/1.1-only connection-
          // specific header, forbidden in HTTP/2 (RFC 7540 §8.1.2.2). Chrome
          // enforces this strictly and kills the stream with
          // ERR_HTTP2_PROTOCOL_ERROR if it's present; curl doesn't validate
          // it, which is why this went undetected via curl-only testing.
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/matches") {
      if (
        SERVICE_SECRET &&
        req.headers.get("X-Service-Secret") !== SERVICE_SECRET
      ) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      let body: MatchesBody;
      try {
        body = (await req.json()) as MatchesBody;
      } catch {
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }

      const key = cacheKey(body);

      if (!body.no_cache) {
        try {
          const cached = await redis.get<unknown>(key);
          if (cached !== null) {
            return Response.json(cached, { headers: { "X-Cache": "HIT" } });
          }
        } catch (err) {
          redisErrors++;
          const msg = err instanceof Error ? err.message : "unknown";
          console.error(`[nado-matches] Redis GET failed: ${msg}`);
        }
      }

      const weight = requestWeight(body);
      const { waited } = await acquireWeight(weight);
      const wasQueued = waited >= RATE_QUEUED_THRESHOLD_MS;
      if (wasQueued) {
        console.log(`[nado-matches] Request queued ${waited}ms (weight=${weight})`);
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
        const responseHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (wasQueued) responseHeaders["X-NadoLens-Queued"] = "true";
        return new Response(await archiveRes.text(), {
          status: archiveRes.status,
          headers: responseHeaders,
        });
      }

      const data: unknown = await archiveRes.json();

      try {
        const ttl = body.idx ? 86_400 : 10;
        await redis.set(key, data, { ex: ttl });
        redisWrites++;
      } catch (err) {
        redisErrors++;
        const msg = err instanceof Error ? err.message : "unknown";
        console.error(`[nado-matches] Redis SET failed: ${msg}`);
      }

      const resHeaders: Record<string, string> = { "X-Cache": "MISS" };
      if (wasQueued) resHeaders["X-NadoLens-Queued"] = "true";
      return Response.json(data, { headers: resHeaders });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`[nado-matches] HTTP server listening on port ${server.port}`);

async function warmCache() {
  const raw = process.env.WARMUP_WALLETS ?? "";
  if (!raw) return;
  const wallets = raw.split(",").map((w) => w.trim()).filter(Boolean);
  for (const wallet of wallets) {
    try {
      await fetch(`http://localhost:${PORT}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({ subaccounts: [wallet], limit: 250, isolated: null }),
      });
      console.log(`[warmup] cached ${wallet.slice(0, 10)}…`);
    } catch {
      console.warn(`[warmup] failed ${wallet.slice(0, 10)}…`);
    }
  }
  console.log("[warmup] complete");
}

warmCache().catch(console.error);
connect();
