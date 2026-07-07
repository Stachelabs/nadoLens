import { NADO_GATEWAY_REST } from "@/lib/nado";
import {
  IsolatedPositionsDataSchema,
  NadoSubaccountDataSchema,
  ProductOrdersDataSchema,
  SubaccountOrdersDataSchema,
} from "@/lib/schemas/nado";
import { categorizedErrorResponse } from "@/lib/api/apiErrorResponse";
import { parseGatewayJson } from "@/lib/api/validateResponse";
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

    // Build Gateway request body — `orders` uses sender + product_ids;
    // all others use subaccount.
    let gatewayBody: Record<string, unknown>;
    if (query === "orders") {
      const rawIds = searchParams.get("product_ids");
      if (!rawIds) {
        return NextResponse.json(
          { error: "product_ids query param required for orders query" },
          { status: 400 },
        );
      }
      const productIds = rawIds.split(",").map(Number).filter(Number.isFinite);
      if (productIds.length === 0) {
        return NextResponse.json(
          { error: "product_ids must contain at least one valid number" },
          { status: 400 },
        );
      }
      gatewayBody = { type: "orders", sender: address, product_ids: productIds };
    } else {
      gatewayBody = { type: query, subaccount: address };
    }

    const response = await fetch(`${NADO_GATEWAY_REST}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify(gatewayBody),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Gateway request failed" },
        { status: response.status },
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
