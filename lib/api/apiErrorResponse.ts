import { NextResponse } from "next/server";

const ERROR_LABELS: Record<string, string> = {
  timeout: "Gateway timeout",
  network: "Gateway unreachable",
  parse: "Invalid Gateway response",
  unknown: "Internal server error",
};

export function categorizedErrorResponse(
  e: unknown,
  routeLabel: string,
  context?: Record<string, string | undefined>,
): NextResponse<{ error: string }> {
  const isTimeout =
    e instanceof DOMException && e.name === "TimeoutError";
  const isNetwork = e instanceof TypeError;
  const isParse = e instanceof SyntaxError;

  const category = isTimeout
    ? "timeout"
    : isNetwork
      ? "network"
      : isParse
        ? "parse"
        : "unknown";
  const status = isTimeout ? 504 : isNetwork || isParse ? 502 : 500;
  const message = e instanceof Error ? e.message : String(e);

  console.error(routeLabel, { category, message, ...context });

  return NextResponse.json({ error: ERROR_LABELS[category] }, { status });
}
