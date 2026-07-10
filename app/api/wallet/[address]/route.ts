import { NADO_FUNDING_SERVICE_URL } from "@/lib/nado";
import {
  IsolatedPositionsDataSchema,
  NadoSubaccountDataSchema,
  ProductOrdersDataSchema,
  SubaccountOrdersDataSchema,
} from "@/lib/schemas/nado";
import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { parseGatewayJson } from "@/lib/api/validateResponse";
import { withTransientRetry } from "@/lib/api/withTransientRetry";
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";

export const dynamic = "force-dynamic";

const QuerySchema = z.enum(["subaccount_info", "subaccount_orders", "isolated_positions", "orders"]);

type Props = {
  params: Promise<{ address: string }>;
};

function gatewayParseErrorResponse(parsed: {
  ok: false;
  kind: "invalid" | "gateway_failure";
  error?: string;
  error_code?: number;
}) {
  if (parsed.kind === "gateway_failure") {
    const code = parsed.error_code ? ` (${parsed.error_code})` : "";
    return NextResponse.json(
      { error: `${parsed.error ?? "Gateway query failed"}${code}` },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { error: "Invalid response from Gateway" },
    { status: 502 },
  );
}

export async function GET(request: NextRequest, { params }: Props) {
  let query: string | undefined;
  try {
    const { address } = await params;
    const { searchParams } = new URL(request.url);

    const queryResult = QuerySchema.safeParse(
      searchParams.get("query") ?? "subaccount_info",
    );
    if (!queryResult.success) {
      return NextResponse.json({ error: "Invalid query type" }, { status: 400 });
    }
    query = queryResult.data;

    // Accept 20-byte EVM address (via isAddress) or 32-byte subaccount bytes32
    const isBytes32 = /^0x[a-fA-F0-9]{64}$/.test(address);
    if (!isAddress(address) && !isBytes32) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    // Build the positions-proxy body — `orders` uses sender + product_ids;
    // all others use subaccount. Proxied through nado-funding (Fly.io, static
    // egress IP + rate-limit lift + short-TTL cache) instead of calling
    // Gateway directly from Vercel's ephemeral IP.
    let positionsBody: Record<string, unknown>;
    if (query === "orders") {
      const rawIds = searchParams.get("product_ids");
      if (!rawIds) {
        return NextResponse.json(
          { error: "product_ids query param required for orders query" },
          { status: 400 },
        );
      }
      const productIds = rawIds.split(",").map(Number).filter(Number.isFinite);
      if (productIds.length === 0 || productIds.length > 200) {
        return NextResponse.json(
          { error: "product_ids must contain between 1 and 200 valid numbers" },
          { status: 400 },
        );
      }
      positionsBody = { query: "orders", sender: address, product_ids: productIds };
    } else {
      positionsBody = { query, subaccount: address };
    }

    const serviceSecret = process.env.SERVICE_SECRET;
    if (!serviceSecret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    if (!NADO_FUNDING_SERVICE_URL) {
      return NextResponse.json(
        { error: "Funding service not configured" },
        { status: 503 },
      );
    }

    const response = await withTransientRetry(
      () =>
        fetch(`${NADO_FUNDING_SERVICE_URL}/positions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Service-Secret": serviceSecret,
          },
          body: JSON.stringify(positionsBody),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        }),
      // retryOnHttpStatus: false — nado-funding already retries Gateway
      // internally (fetchGatewayWithRetry, up to 4 attempts) and its
      // response is a deliberate, final decision (including its own
      // fail-closed 429). Retrying that response here would just re-enter
      // the Fly service's rate limiter and re-trigger its own 4-attempt
      // retry, multiplying real upstream calls up to 12x during exactly the
      // moment (a Gateway outage/429 storm) that's most harmful.
      // maxAttempts:2 now covers only a thrown network error — the Fly
      // service itself being transiently unreachable (a quick connection
      // blip; nado-funding's own internal retry can't cover that since it
      // never runs if the process/network path itself is down).
      { maxAttempts: 2, retryOnHttpStatus: false },
    );

    if (!response.ok) {
      const headers: Record<string, string> = {};
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) headers["Retry-After"] = retryAfter;
      return NextResponse.json(
        { error: "Positions service request failed" },
        { status: response.status, headers },
      );
    }

    const raw: unknown = await response.json();

    if (query === "subaccount_info") {
      const parsed = parseGatewayJson(NadoSubaccountDataSchema, raw);
      if (!parsed.ok) return gatewayParseErrorResponse(parsed);
      return NextResponse.json(parsed.data);
    }

    if (query === "subaccount_orders") {
      const parsed = parseGatewayJson(SubaccountOrdersDataSchema, raw);
      if (!parsed.ok) return gatewayParseErrorResponse(parsed);
      return NextResponse.json(parsed.data);
    }

    if (query === "orders") {
      const parsed = parseGatewayJson(ProductOrdersDataSchema, raw);
      if (!parsed.ok) return gatewayParseErrorResponse(parsed);
      return NextResponse.json(parsed.data);
    }

    if (query === "isolated_positions") {
      const parsed = parseGatewayJson(IsolatedPositionsDataSchema, raw);
      if (!parsed.ok) return gatewayParseErrorResponse(parsed);
      return NextResponse.json(parsed.data);
    }

    return NextResponse.json({ error: "Unhandled query type" }, { status: 400 });
  } catch (e) {
    return categorizedErrorResponse(e, "[api/wallet]", { query });
  }
}
