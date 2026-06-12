import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { withTransientRetry } from "@/lib/api/withTransientRetry";
import { NADO_MATCHES_SERVICE_URL } from "@/lib/nado";
import {
  ArchiveMatchesResponseSchema,
  MatchesQueryRequestSchema,
  type ArchiveMatch,
} from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { cacheKey, hashParams, redis } from "@/lib/redis";
import { z } from "zod";

export const dynamic = "force-dynamic";

type ErrResponse = { error: string };
type MatchesResponse = z.infer<typeof ArchiveMatchesResponseSchema>;

const SOFT_TTL_MS = 5_000;
const HARD_TTL_S = 300;
const MAX_MATCHES = 500;

type CachedFirstPage = {
  highestIdx: string;
  matches: MatchesResponse["matches"];
  txs: MatchesResponse["txs"];
  updatedAt: number;
};

function isFirstPageRequest(body: z.infer<typeof MatchesQueryRequestSchema>): boolean {
  return !body.idx && !body.product_ids?.length && !body.no_cache;
}

function firstPageCacheKey(body: z.infer<typeof MatchesQueryRequestSchema>): string {
  return cacheKey(
    "vmatch",
    hashParams({ subaccounts: [...body.subaccounts].sort(), isolated: body.isolated }),
  );
}

function highestIdx(matches: ArchiveMatch[]): string | null {
  if (matches.length === 0) return null;
  let best = BigInt(matches[0].submission_idx);
  let bestStr = matches[0].submission_idx;
  for (let i = 1; i < matches.length; i++) {
    const v = BigInt(matches[i].submission_idx);
    if (v > best) {
      best = v;
      bestStr = matches[i].submission_idx;
    }
  }
  return bestStr;
}

async function fetchFromService(
  body: z.infer<typeof MatchesQueryRequestSchema>,
  serviceSecret: string,
): Promise<MatchesResponse | null> {
  const response = await withTransientRetry(
    () =>
      fetch(`${NADO_MATCHES_SERVICE_URL}/matches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Secret": serviceSecret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(18_000),
        cache: "no-store",
      }),
    { maxAttempts: 1 },
  );

  if (!response.ok) return null;

  const raw: unknown = await response.json();
  const parsed = parseArchiveJson(ArchiveMatchesResponseSchema, raw);
  return parsed.ok ? parsed.data : null;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<MatchesResponse | ErrResponse>> {
  try {
    const serviceSecret = process.env.SERVICE_SECRET;
    if (!serviceSecret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const bodyResult = MatchesQueryRequestSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json({ error: "Invalid matches request body" }, { status: 400 });
    }

    if (!NADO_MATCHES_SERVICE_URL) {
      return NextResponse.json(
        { error: "Matches service not configured" },
        { status: 503 },
      );
    }

    const body = bodyResult.data;

    // ── Paginated / product-scoped / no_cache → pass through ──────────────
    if (!isFirstPageRequest(body)) {
      const data = await fetchFromService(body, serviceSecret);
      if (!data) {
        return NextResponse.json(
          { error: "Matches service request failed" },
          { status: 502 },
        );
      }
      return NextResponse.json(data);
    }

    // ── First-page: incremental cache ─────────────────────────────────────
    const key = firstPageCacheKey(body);
    let cached: CachedFirstPage | null = null;

    try {
      cached = await redis.get<CachedFirstPage>(key);
    } catch {
      // Cache unavailable — proceed without
    }

    // Soft hit: fresh enough to return immediately
    if (cached && Date.now() - cached.updatedAt < SOFT_TTL_MS) {
      return NextResponse.json(
        { matches: cached.matches, txs: cached.txs },
        { headers: { "X-Cache": "VHIT" } },
      );
    }

    // Fetch fresh from Fly.io
    const fresh = await fetchFromService(body, serviceSecret);
    if (!fresh) {
      // Fly.io failed — return stale cache if available
      if (cached) {
        return NextResponse.json(
          { matches: cached.matches, txs: cached.txs },
          { headers: { "X-Cache": "VSTALE" } },
        );
      }
      return NextResponse.json(
        { error: "Matches service request failed" },
        { status: 502 },
      );
    }

    // No cache or empty fresh → store and return
    if (!cached || fresh.matches.length === 0) {
      const hi = highestIdx(fresh.matches);
      if (hi) {
        const entry: CachedFirstPage = {
          highestIdx: hi,
          matches: fresh.matches,
          txs: fresh.txs,
          updatedAt: Date.now(),
        };
        try {
          await redis.set(key, entry, { ex: HARD_TTL_S });
        } catch {
          // Non-fatal
        }
      }
      return NextResponse.json(fresh, { headers: { "X-Cache": "VMISS" } });
    }

    // ── Incremental merge ─────────────────────────────────────────────────
    const cachedHighest = BigInt(cached.highestIdx);
    const newMatches = fresh.matches.filter((m) => {
      try {
        return BigInt(m.submission_idx) > cachedHighest;
      } catch {
        return true;
      }
    });

    if (newMatches.length === 0) {
      // No new trades — refresh timestamp
      const refreshed: CachedFirstPage = { ...cached, updatedAt: Date.now() };
      try {
        await redis.set(key, refreshed, { ex: HARD_TTL_S });
      } catch {
        // Non-fatal
      }
      return NextResponse.json(
        { matches: cached.matches, txs: cached.txs },
        { headers: { "X-Cache": "VINCR-SAME" } },
      );
    }

    // Merge: new trades first, then cached, trim to MAX_MATCHES
    const mergedMatches = [...newMatches, ...cached.matches].slice(0, MAX_MATCHES);

    // Merge txs: union by submission_idx
    const txIdxSet = new Set(cached.txs.map((t) => t.submission_idx));
    const newTxs = fresh.txs.filter((t) => !txIdxSet.has(t.submission_idx));
    const mergedTxs = [...newTxs, ...cached.txs];

    const mergedHighest = highestIdx(mergedMatches) ?? cached.highestIdx;
    const entry: CachedFirstPage = {
      highestIdx: mergedHighest,
      matches: mergedMatches,
      txs: mergedTxs,
      updatedAt: Date.now(),
    };

    try {
      await redis.set(key, entry, { ex: HARD_TTL_S });
    } catch {
      // Non-fatal
    }

    return NextResponse.json(
      { matches: mergedMatches, txs: mergedTxs },
      { headers: { "X-Cache": `VINCR-NEW(${newMatches.length})` } },
    );
  } catch (e) {
    return categorizedErrorResponse(e, "[api/matches]");
  }
}
