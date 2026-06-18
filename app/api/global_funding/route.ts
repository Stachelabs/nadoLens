import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { withTransientRetry } from "@/lib/api/withTransientRetry";
import { NADO_FUNDING_SERVICE_URL } from "@/lib/nado";
import {
  InterestAndFundingPaymentsResponseSchema,
  GlobalFundingRequestSchema,
  type FundingOrInterestPayment,
} from "@/lib/schemas/nado";
import { NextResponse, type NextRequest } from "next/server";
import { parseArchiveJson } from "@/lib/api/validateResponse";
import { cacheKey, hashParams, logRedisError, redis } from "@/lib/redis";
import { z } from "zod";

export const dynamic = "force-dynamic";

type ErrResponse = { error: string };
type FundingResponse = z.infer<typeof InterestAndFundingPaymentsResponseSchema>;

const SOFT_TTL_MS = 30_000;
const HARD_TTL_S = 300;

type CachedFirstPage = {
  highestIdx: string;
  funding_payments: FundingResponse["funding_payments"];
  interest_payments: FundingResponse["interest_payments"];
  next_idx: FundingResponse["next_idx"];
  updatedAt: number;
};

function isFirstPageRequest(body: z.infer<typeof GlobalFundingRequestSchema>): boolean {
  return !body.max_idx && !body.no_cache;
}

function firstPageCacheKey(body: z.infer<typeof GlobalFundingRequestSchema>): string {
  return cacheKey(
    "vfund",
    hashParams({
      subaccount: body.subaccount,
      product_ids: [...body.product_ids].sort((a, b) => a - b),
      limit: body.limit,
    }),
  );
}

function highestIdx(payments: FundingOrInterestPayment[]): string | null {
  if (payments.length === 0) return null;
  let best = BigInt(payments[0].idx);
  let bestStr = payments[0].idx;
  for (let i = 1; i < payments.length; i++) {
    const v = BigInt(payments[i].idx);
    if (v > best) {
      best = v;
      bestStr = payments[i].idx;
    }
  }
  return bestStr;
}

async function fetchFromService(
  body: z.infer<typeof GlobalFundingRequestSchema>,
  serviceSecret: string,
): Promise<FundingResponse | null> {
  const response = await withTransientRetry(
    () =>
      fetch(`${NADO_FUNDING_SERVICE_URL}/funding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Secret": serviceSecret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      }),
    { maxAttempts: 3 },
  );

  if (!response.ok) return null;

  const raw: unknown = await response.json();
  const parsed = parseArchiveJson(InterestAndFundingPaymentsResponseSchema, raw);
  return parsed.ok ? parsed.data : null;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<FundingResponse | ErrResponse>> {
  try {
    const serviceSecret = process.env.SERVICE_SECRET;
    if (!serviceSecret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const bodyResult = GlobalFundingRequestSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json({ error: "Invalid funding request body" }, { status: 400 });
    }

    if (!NADO_FUNDING_SERVICE_URL) {
      return NextResponse.json(
        { error: "Funding service not configured" },
        { status: 503 },
      );
    }

    const body = bodyResult.data;

    // ── Paginated / no_cache → pass through ──────────────────────────────
    if (!isFirstPageRequest(body)) {
      const data = await fetchFromService(body, serviceSecret);
      if (!data) {
        return NextResponse.json(
          { error: "Funding service request failed" },
          { status: 502 },
        );
      }
      return NextResponse.json(data);
    }

    // ── First-page: incremental cache ─────────────────────────────────────
    const key = firstPageCacheKey(body);
    let cached: CachedFirstPage | null = null;

    try {
      const raw = await redis.get<CachedFirstPage>(key);
      if (
        raw &&
        typeof raw.highestIdx === "string" &&
        Array.isArray(raw.funding_payments) &&
        Array.isArray(raw.interest_payments) &&
        typeof raw.updatedAt === "number"
      ) {
        cached = raw;
      }
    } catch (err) {
      logRedisError("get", key, err);
    }

    // Soft hit: fresh enough to return immediately
    if (cached && Date.now() - cached.updatedAt < SOFT_TTL_MS) {
      return NextResponse.json(
        {
          funding_payments: cached.funding_payments,
          interest_payments: cached.interest_payments,
          next_idx: cached.next_idx,
        },
        { headers: { "X-Cache": "VHIT" } },
      );
    }

    // Fetch fresh from Fly.io
    const fresh = await fetchFromService(body, serviceSecret);
    if (!fresh) {
      if (cached) {
        return NextResponse.json(
          {
            funding_payments: cached.funding_payments,
            interest_payments: cached.interest_payments,
            next_idx: cached.next_idx,
          },
          { headers: { "X-Cache": "VSTALE" } },
        );
      }
      return NextResponse.json(
        { error: "Funding service request failed" },
        { status: 502 },
      );
    }

    // No cache → store fresh and return
    if (!cached) {
      const hi = highestIdx(fresh.funding_payments);
      if (hi) {
        const entry: CachedFirstPage = {
          highestIdx: hi,
          funding_payments: fresh.funding_payments,
          interest_payments: fresh.interest_payments,
          next_idx: fresh.next_idx,
          updatedAt: Date.now(),
        };
        try {
          await redis.set(key, entry, { ex: HARD_TTL_S });
        } catch (err) {
          logRedisError("set", key, err);
        }
      }
      return NextResponse.json(fresh, { headers: { "X-Cache": "VMISS" } });
    }

    // Fly.io returned empty but cache has data → serve stale
    if (fresh.funding_payments.length === 0) {
      const refreshed: CachedFirstPage = { ...cached, updatedAt: Date.now() };
      try {
        await redis.set(key, refreshed, { ex: HARD_TTL_S });
      } catch (err) {
        logRedisError("set", key, err);
      }
      return NextResponse.json(
        {
          funding_payments: cached.funding_payments,
          interest_payments: cached.interest_payments,
          next_idx: cached.next_idx,
        },
        { headers: { "X-Cache": "VSTALE" } },
      );
    }

    // ── Incremental merge ─────────────────────────────────────────────────
    const cachedHighest = BigInt(cached.highestIdx);
    const newPayments = fresh.funding_payments.filter((p) => {
      try {
        return BigInt(p.idx) > cachedHighest;
      } catch {
        return true;
      }
    });

    if (newPayments.length === 0) {
      const refreshed: CachedFirstPage = { ...cached, updatedAt: Date.now() };
      try {
        await redis.set(key, refreshed, { ex: HARD_TTL_S });
      } catch (err) {
        logRedisError("set", key, err);
      }
      return NextResponse.json(
        {
          funding_payments: cached.funding_payments,
          interest_payments: cached.interest_payments,
          next_idx: cached.next_idx,
        },
        { headers: { "X-Cache": "VINCR-SAME" } },
      );
    }

    const mergedFunding = [...newPayments, ...cached.funding_payments].slice(0, 100);

    const newInterest = fresh.interest_payments.filter((p) => {
      try {
        return BigInt(p.idx) > cachedHighest;
      } catch {
        return true;
      }
    });
    const mergedInterest = [...newInterest, ...cached.interest_payments].slice(0, 100);

    const mergedHighest = highestIdx(mergedFunding) ?? cached.highestIdx;
    const entry: CachedFirstPage = {
      highestIdx: mergedHighest,
      funding_payments: mergedFunding,
      interest_payments: mergedInterest,
      next_idx: fresh.next_idx,
      updatedAt: Date.now(),
    };

    try {
      await redis.set(key, entry, { ex: HARD_TTL_S });
    } catch (err) {
      logRedisError("set", key, err);
    }

    return NextResponse.json(
      {
        funding_payments: mergedFunding,
        interest_payments: mergedInterest,
        next_idx: fresh.next_idx,
      },
      { headers: { "X-Cache": `VINCR-NEW(${newPayments.length})` } },
    );
  } catch (e) {
    return categorizedErrorResponse(e, "[api/global_funding]");
  }
}
