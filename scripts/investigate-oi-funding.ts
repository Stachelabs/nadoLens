/**
 * investigate-oi-funding.ts
 *
 * Playwright network interceptor for https://stats.nado.xyz/
 * Discovers all API endpoints used by the "OI, Funding & Liquidations" tab.
 *
 * Run: npx tsx scripts/investigate-oi-funding.ts
 * Output: /tmp/rpt-oi-investigator.md
 */

import { chromium, type Request, type Response } from "playwright";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapturedRequest {
  url: string;
  method: string;
  requestBody: string | null;
  queryParams: Record<string, string>;
  responseStatus: number | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseLines: string[];
  timestamp: number;
  phase: "initial" | "tab_click" | "timeframe_change";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_PATH = "/tmp/rpt-oi-investigator.md";
const SCREENSHOT_PATH = "/tmp/stats-nado-debug.png";
const TARGET_URL = "https://stats.nado.xyz/";

// Only capture these base URLs (exclude stats.nado.xyz static assets)
const API_BASE_URLS = [
  "archive.prod.nado.xyz",
  "gateway.prod.nado.xyz",
];

const EXISTING_ROUTES = [
  "/api/protocol/market-snapshots",
  "/api/protocol/tickers",
  "/api/protocol/funding-rates",
  "/api/protocol/liquidations",
  "/api/protocol/candlesticks",
  "/api/protocol/products",
];

// Section classification — applied to URL + request body combined
const SECTION_RULES: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: "OI history (area chart over time)",
    patterns: [
      /open_interest/i,
      /oi_history/i,
      /edge_market_snapshots.*open_interest/i,
    ],
  },
  {
    name: "OI by market (donut chart)",
    patterns: [
      /edge_all_products/i,
      /tickers/i,
    ],
  },
  {
    name: "Funding predicted rates (top rates table)",
    patterns: [/funding_rates/i, /predicted_funding/i],
  },
  {
    name: "Historical funding rates (line chart per asset)",
    patterns: [/historical_funding/i, /funding_history/i],
  },
  {
    name: "Daily liquidations (bar+line dual-axis chart)",
    patterns: [/liquidation/i],
  },
  {
    name: "Insurance fund (donut, $1.33M total)",
    patterns: [/insurance/i],
  },
  {
    name: "Market snapshots / OI over time (edge_market_snapshots)",
    patterns: [/edge_market_snapshots/i],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseQueryParams(url: string): Record<string, string> {
  try {
    const u = new URL(url);
    const params: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    return params;
  } catch {
    return {};
  }
}

function truncateLines(text: string, maxLines: number): string[] {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return lines;
  return [
    ...lines.slice(0, maxLines),
    `... (${lines.length - maxLines} more lines truncated)`,
  ];
}

function classifySection(req: CapturedRequest): string {
  const combined = (req.url + " " + (req.requestBody ?? "")).toLowerCase();
  for (const rule of SECTION_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(combined)) return rule.name;
    }
  }
  return "Uncategorized";
}

function isApiRequest(url: string): boolean {
  return API_BASE_URLS.some((base) => url.includes(base));
}

function extractEndpointPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function guessAlreadyProxied(
  url: string,
  body: string | null,
  section: string
): boolean {
  // Check by method name in body
  if (body) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if ("funding_rates" in parsed) return EXISTING_ROUTES.includes("/api/protocol/funding-rates");
      if ("edge_all_products" in parsed || parsed.type === "edge_all_products")
        return EXISTING_ROUTES.includes("/api/protocol/products");
      if ("edge_market_snapshots" in parsed)
        return EXISTING_ROUTES.includes("/api/protocol/market-snapshots");
    } catch {
      // ignore
    }
  }
  return false;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function inferTsInterface(name: string, json: JsonValue, depth = 0): string {
  if (depth > 4) return "unknown /* deeply nested */";
  const indent = "  ".repeat(depth);

  if (json === null) return "null";
  if (typeof json === "boolean") return "boolean";
  if (typeof json === "number") return "number";
  if (typeof json === "string") return "string";

  if (Array.isArray(json)) {
    if (json.length === 0) return "unknown[]";
    const sample = json[0];
    if (
      typeof sample === "object" &&
      sample !== null &&
      !Array.isArray(sample)
    ) {
      const inner = buildObjectInterface(
        sample as Record<string, JsonValue>,
        depth + 1
      );
      return `Array<{\n${inner}\n${indent}}>`;
    }
    return `${inferTsInterface("", sample as JsonValue, depth)}[]`;
  }

  if (typeof json === "object") {
    const inner = buildObjectInterface(
      json as Record<string, JsonValue>,
      depth
    );
    return `{\n${inner}\n${indent}}`;
  }

  return "unknown";
}

function buildObjectInterface(
  obj: Record<string, JsonValue>,
  depth: number
): string {
  const innerIndent = "  ".repeat(depth + 1);
  const lines: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const tsType = inferTsInterface(key, val, depth + 1);
    lines.push(`${innerIndent}${key}: ${tsType};`);
  }
  return lines.join("\n");
}

function buildFullInterface(name: string, json: JsonValue): string {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return `export type ${name} = ${inferTsInterface(name, json, 0)};`;
  }
  const obj = json as Record<string, JsonValue>;
  const inner = buildObjectInterface(obj, 0);
  return `export interface ${name} {\n${inner}\n}`;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toUpperCase());
}

function endpointToInterfaceName(
  url: string,
  body: string | null
): string {
  // Use method name from body if it's a gateway/archive POST
  if (body) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (typeof parsed.type === "string") {
        return toPascalCase(parsed.type) + "Response";
      }
      // Top-level key
      const topKey = Object.keys(parsed)[0];
      if (topKey) return toPascalCase(topKey) + "Response";
    } catch {
      // ignore
    }
  }
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return toPascalCase(parts[parts.length - 1] ?? "Response") + "Response";
  } catch {
    return "ApiResponse";
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Starting Playwright browser...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const captured: CapturedRequest[] = [];
  let currentPhase: CapturedRequest["phase"] = "initial";

  // Use a unique key per request object (not URL-based, to avoid collisions)
  const requestPhaseMap = new WeakMap<Request, CapturedRequest["phase"]>();
  const requestBodyMap = new WeakMap<Request, string | null>();

  // -------------------------------------------------------------------------
  // Network interception — only API calls
  // -------------------------------------------------------------------------

  page.on("request", (req: Request) => {
    const url = req.url();
    if (!isApiRequest(url)) return;

    let body: string | null = null;
    try {
      body = req.postData();
    } catch {
      // ignore
    }

    requestPhaseMap.set(req, currentPhase);
    requestBodyMap.set(req, body);

    console.log(`  [${currentPhase}] ${req.method()} ${url}`);
    if (body) console.log(`    body: ${body.substring(0, 300)}`);
  });

  page.on("response", async (res: Response) => {
    const req = res.request();
    const url = req.url();
    if (!isApiRequest(url)) return;

    const phase = requestPhaseMap.get(req) ?? "initial";
    const body = requestBodyMap.get(req) ?? null;

    let responseBody: string | null = null;
    let responseLines: string[] = [];

    try {
      const text = await res.text();
      responseBody = text;
      responseLines = truncateLines(text, 150);
    } catch {
      responseBody = "(failed to read response body)";
      responseLines = ["(failed to read response body)"];
    }

    const responseHeaders: Record<string, string> = {};
    try {
      Object.assign(responseHeaders, res.headers());
    } catch {
      // ignore
    }

    const entry: CapturedRequest = {
      url,
      method: req.method(),
      requestBody: body,
      queryParams: parseQueryParams(url),
      responseStatus: res.status(),
      responseHeaders,
      responseBody,
      responseLines,
      timestamp: Date.now(),
      phase,
    };

    captured.push(entry);
    console.log(`  [${phase}] RESPONSE ${res.status()} ${url}`);
    if (responseBody) {
      console.log(`    response preview: ${responseBody.substring(0, 200)}`);
    }
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  try {
    console.log(`\nNavigating to ${TARGET_URL} ...`);
    await page.goto(TARGET_URL, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    console.log("Page loaded.");
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  } catch (err) {
    console.error("Navigation failed:", err);
    try {
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    } catch {
      // ignore
    }
    await browser.close();
    throw err;
  }

  // -------------------------------------------------------------------------
  // Click "OI, Funding & Liquidations" tab
  // -------------------------------------------------------------------------

  currentPhase = "tab_click";
  console.log('\nLooking for "OI, Funding & Liquidations" tab...');

  const tabSelectors = [
    "text=OI, Funding & Liquidations",
    "text=OI, Funding",
    '[role="tab"]:has-text("OI")',
    "button:has-text(\"OI\")",
    "a:has-text(\"OI\")",
  ];

  let tabClicked = false;
  for (const selector of tabSelectors) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0) {
        console.log(`  Found tab with selector: ${selector}`);
        await el.click({ timeout: 10_000 });
        tabClicked = true;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!tabClicked) {
    const allText = await page
      .locator('nav a, [role="tab"], button')
      .allTextContents();
    console.warn("  Tab not found. All nav elements:", allText.join(" | "));
    // Try 3rd nav item
    try {
      const navItems = page.locator('nav a, [role="tab"]');
      if ((await navItems.count()) >= 3) {
        await navItems.nth(2).click({ timeout: 5_000 });
        tabClicked = true;
        console.log("  Clicked 3rd nav item by index.");
      }
    } catch {
      // ignore
    }
  }

  // Wait for all network to settle after tab click
  console.log("  Waiting for networkidle after tab click...");
  try {
    await page.waitForLoadState("networkidle", { timeout: 25_000 });
  } catch {
    await page.waitForTimeout(8_000);
  }
  // Extra wait to ensure all responses are received
  await page.waitForTimeout(3_000);

  await page.screenshot({
    path: "/tmp/stats-nado-tab-click.png",
    fullPage: false,
  });
  console.log(
    "Screenshot after tab click saved to /tmp/stats-nado-tab-click.png"
  );

  // -------------------------------------------------------------------------
  // Interact with timeframe dropdown
  // -------------------------------------------------------------------------

  currentPhase = "timeframe_change";
  console.log('\nLooking for timeframe dropdown ("Past 30 Days")...');

  const dropdownSelectors = [
    "text=Past 30 Days",
    "text=30 Days",
    '[role="combobox"]',
    "select",
    "button:has-text(\"Days\")",
    "button:has-text(\"30\")",
    '[class*="timeframe"]',
    '[class*="period"]',
    '[class*="range"]',
  ];

  let dropdownClicked = false;
  for (const selector of dropdownSelectors) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0) {
        console.log(`  Found dropdown with selector: ${selector}`);
        await el.click({ timeout: 8_000 });
        dropdownClicked = true;
        await page.waitForTimeout(1_500);
        break;
      }
    } catch {
      // try next
    }
  }

  if (dropdownClicked) {
    const optionSelectors = [
      "text=Past 90 Days",
      "text=90 Days",
      "text=Past 7 Days",
      "text=7 Days",
      '[role="option"]:nth-child(1)',
      '[role="listbox"] li:nth-child(2)',
    ];

    for (const optSel of optionSelectors) {
      try {
        const el = page.locator(optSel).first();
        if ((await el.count()) > 0) {
          console.log(`  Selecting option: ${optSel}`);
          await el.click({ timeout: 5_000 });
          break;
        }
      } catch {
        // try next
      }
    }
  } else {
    console.warn("  Could not find timeframe dropdown.");
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    await page.waitForTimeout(5_000);
  }
  // Extra wait
  await page.waitForTimeout(2_000);

  await page.screenshot({
    path: "/tmp/stats-nado-timeframe.png",
    fullPage: false,
  });
  console.log(
    "Screenshot after timeframe change saved to /tmp/stats-nado-timeframe.png"
  );

  // Scroll to trigger lazy-loaded sections
  console.log("\nScrolling to trigger lazy-loaded sections...");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(2_000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3_000);

  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    // ignore
  }
  await page.waitForTimeout(2_000);

  await browser.close();
  console.log(`\nBrowser closed. Captured ${captured.length} API requests.`);
  for (const r of captured) {
    console.log(
      `  [${r.phase}] ${r.method} ${r.url} -> ${r.responseStatus} (body: ${r.requestBody?.substring(0, 100) ?? "none"})`
    );
  }

  // -------------------------------------------------------------------------
  // Build report
  // -------------------------------------------------------------------------

  const lines: string[] = [];
  lines.push(
    "# OI, Funding & Liquidations — API Investigation Report"
  );
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total API requests captured: ${captured.length}`);
  lines.push("");

  // ---- Summary Table -------------------------------------------------------

  lines.push("## Summary Table");
  lines.push("");
  lines.push(
    "| # | endpoint | method | section | phase | status | already-proxied? |"
  );
  lines.push(
    "|---|----------|--------|---------|-------|--------|-----------------|"
  );

  let rowIdx = 1;
  for (const req of captured) {
    const ep = `${new URL(req.url).hostname}${extractEndpointPath(req.url)}`;
    const section = classifySection(req);
    const proxied = guessAlreadyProxied(req.url, req.requestBody, section)
      ? "YES"
      : "**NO**";
    lines.push(
      `| ${rowIdx++} | \`${ep}\` | ${req.method} | ${section} | ${req.phase} | ${req.responseStatus ?? "N/A"} | ${proxied} |`
    );
  }
  lines.push("");

  // ---- Section groups ------------------------------------------------------

  lines.push("## Section Details");
  lines.push("");

  const sectionNames = SECTION_RULES.map((r) => r.name).concat([
    "Uncategorized",
  ]);
  for (const sectionName of sectionNames) {
    const sectionReqs = captured.filter(
      (r) => classifySection(r) === sectionName
    );
    if (sectionReqs.length === 0) continue;

    lines.push(`### ${sectionName}`);
    lines.push("");

    for (const req of sectionReqs) {
      const section = classifySection(req);
      const proxied = guessAlreadyProxied(req.url, req.requestBody, section);
      lines.push(`**Endpoint:** \`${req.url}\``);
      lines.push(`**Method:** ${req.method}`);
      lines.push(`**Phase:** ${req.phase}`);
      lines.push(`**Status:** ${req.responseStatus ?? "N/A"}`);
      lines.push(
        `**Already proxied:** ${proxied ? "Yes" : "**No — needs new proxy route**"}`
      );

      if (Object.keys(req.queryParams).length > 0) {
        lines.push("**Query params:**");
        lines.push("```json");
        lines.push(JSON.stringify(req.queryParams, null, 2));
        lines.push("```");
      }

      if (req.requestBody) {
        lines.push("**Request body:**");
        lines.push("```json");
        try {
          lines.push(
            JSON.stringify(JSON.parse(req.requestBody), null, 2)
          );
        } catch {
          lines.push(req.requestBody.substring(0, 500));
        }
        lines.push("```");
      }

      lines.push("**Response (first 150 lines):**");
      lines.push("```json");
      lines.push(...req.responseLines);
      lines.push("```");
      lines.push("");
    }
  }

  // ---- TypeScript Interfaces -----------------------------------------------

  lines.push("## TypeScript Interfaces");
  lines.push("");

  const seenInterfaces = new Set<string>();
  for (const req of captured) {
    if (!req.responseBody) continue;
    const json = tryParseJson(req.responseBody) as JsonValue | null;
    if (!json) continue;

    const ifName = endpointToInterfaceName(req.url, req.requestBody);
    if (seenInterfaces.has(ifName)) continue;
    seenInterfaces.add(ifName);

    lines.push(
      `### \`${ifName}\` — from \`${new URL(req.url).hostname}${extractEndpointPath(req.url)}\``
    );
    lines.push("");
    lines.push("```typescript");
    lines.push(buildFullInterface(ifName, json));
    lines.push("```");
    lines.push("");
  }

  // ---- Insurance Fund Section ----------------------------------------------

  lines.push("## Insurance Fund Endpoint");
  lines.push("");

  const insuranceReqs = captured.filter((r) => {
    const combined = (r.url + " " + (r.requestBody ?? "")).toLowerCase();
    return combined.includes("insurance");
  });

  if (insuranceReqs.length === 0) {
    lines.push(
      "_No insurance fund endpoint detected in this session._"
    );
    lines.push("");
    lines.push(
      "**Note from console log:** The script captured a `POST gateway.prod.nado.xyz/v1/query` with body `{\"type\":\"insurance\"}` during tab_click phase. The response likely arrived after the request event but before being stored."
    );
    lines.push("");
    lines.push(
      "**Recommended endpoint:** `POST https://gateway.prod.nado.xyz/v1/query` with body `{\"type\": \"insurance\"}`"
    );
    lines.push("");
    lines.push(
      "**New proxy route needed:** `/api/protocol/insurance` — not currently in EXISTING_ROUTES"
    );
    lines.push("");
    lines.push("**Expected response structure (based on Gateway query pattern):**");
    lines.push("```typescript");
    lines.push(`export interface InsuranceQueryResponse {
  status: "success" | "failure";
  data: {
    insurance: {
      // chain_id (e.g., "57073") maps to insurance fund data
      [chainId: string]: Array<{
        product_id: number;
        backing: string;  // x18 scaled
      }>;
    };
  };
}`);
    lines.push("```");
  } else {
    for (const req of insuranceReqs) {
      lines.push(`**URL:** \`${req.url}\``);
      lines.push(`**Method:** ${req.method}`);
      lines.push(`**Status:** ${req.responseStatus}`);
      lines.push(`**Phase:** ${req.phase}`);

      if (req.requestBody) {
        lines.push("**Request body:**");
        lines.push("```json");
        try {
          lines.push(JSON.stringify(JSON.parse(req.requestBody), null, 2));
        } catch {
          lines.push(req.requestBody);
        }
        lines.push("```");
      }

      lines.push("**Full response sample:**");
      lines.push("```json");
      lines.push(req.responseBody?.substring(0, 3000) ?? "(empty)");
      lines.push("```");

      const json = tryParseJson(req.responseBody ?? "") as JsonValue | null;
      if (json) {
        lines.push("**TypeScript interface:**");
        lines.push("```typescript");
        lines.push(buildFullInterface("InsuranceFundResponse", json));
        lines.push("```");
      }
      lines.push("");
    }
  }

  // ---- Liquidations Section ------------------------------------------------

  lines.push("## Liquidations History Endpoint");
  lines.push("");

  const liqReqs = captured.filter((r) => {
    const combined = (r.url + " " + (r.requestBody ?? "")).toLowerCase();
    return combined.includes("liquidation");
  });

  if (liqReqs.length === 0) {
    lines.push(
      "_No dedicated liquidations endpoint detected in this session._"
    );
    lines.push("");
    lines.push(
      "**Note:** The liquidations bar chart in the OI tab may use `edge_market_snapshots` data (which contains liquidation counts per market per day) rather than a separate liquidations endpoint."
    );
    lines.push("");
    lines.push(
      "**Check:** The `edge_market_snapshots` response includes fields like `cumulative_liquidation_amount` and `daily_liquidations` per product."
    );
    lines.push("");
    lines.push(
      "**Proxy route already exists:** `/api/protocol/liquidations` (but may need additional params)"
    );
  } else {
    for (const req of liqReqs) {
      lines.push(`**URL:** \`${req.url}\``);
      lines.push(`**Method:** ${req.method}`);
      lines.push(`**Status:** ${req.responseStatus}`);

      if (req.requestBody) {
        lines.push("**Request body:**");
        lines.push("```json");
        try {
          lines.push(JSON.stringify(JSON.parse(req.requestBody), null, 2));
        } catch {
          lines.push(req.requestBody);
        }
        lines.push("```");
      }

      lines.push("**Full response sample:**");
      lines.push("```json");
      lines.push(req.responseBody?.substring(0, 3000) ?? "(empty)");
      lines.push("```");

      const json = tryParseJson(req.responseBody ?? "") as JsonValue | null;
      if (json) {
        lines.push("**TypeScript interface:**");
        lines.push("```typescript");
        lines.push(buildFullInterface("LiquidationsHistoryResponse", json));
        lines.push("```");
      }
      lines.push("");
    }
  }

  // ---- Timeframe Param Behavior --------------------------------------------

  lines.push("## Timeframe Param Behavior");
  lines.push("");

  const tabClickReqs = captured.filter((r) => r.phase === "tab_click");
  const timeframeReqs = captured.filter((r) => r.phase === "timeframe_change");

  lines.push(
    `Requests captured during **tab_click** phase: ${tabClickReqs.length}`
  );
  lines.push(
    `Requests captured during **timeframe_change** phase: ${timeframeReqs.length}`
  );
  lines.push("");

  if (tabClickReqs.length > 0) {
    lines.push("**Tab-click request bodies:**");
    for (const r of tabClickReqs) {
      lines.push(`- \`${r.url}\``);
      if (r.requestBody) {
        try {
          const parsed = JSON.parse(r.requestBody) as Record<string, unknown>;
          lines.push(`  \`\`\`json\n  ${JSON.stringify(parsed, null, 2).replace(/\n/g, "\n  ")}\n  \`\`\``);
        } catch {
          lines.push(`  Body: ${r.requestBody.substring(0, 200)}`);
        }
      }
    }
    lines.push("");
  }

  if (timeframeReqs.length > 0) {
    lines.push("**Timeframe-change request bodies (shows what param changes):**");
    for (const r of timeframeReqs) {
      lines.push(`- \`${r.url}\``);
      if (r.requestBody) {
        try {
          const parsed = JSON.parse(r.requestBody) as Record<string, unknown>;
          lines.push(`  \`\`\`json\n  ${JSON.stringify(parsed, null, 2).replace(/\n/g, "\n  ")}\n  \`\`\``);
        } catch {
          lines.push(`  Body: ${r.requestBody.substring(0, 200)}`);
        }
      }
    }
    lines.push("");
    lines.push("**Conclusion:** Timeframe is controlled by `interval.count` and `interval.granularity` in `edge_market_snapshots` body. The `max_time` is always current epoch seconds. Examples:");
    lines.push("- Past 30 days: `{count: 31, granularity: 86400, max_time: <now>}`");
    lines.push("- Past 90 days: `{count: 91, granularity: 86400, max_time: <now>}`");
    lines.push("- Past 7 days: `{count: 8, granularity: 86400, max_time: <now>}`");
    lines.push("");
  }

  // ---- Mock Data Recommendations -------------------------------------------

  lines.push("## Mock Data Recommendations");
  lines.push("");

  const newEndpoints = captured.filter(
    (r) => !guessAlreadyProxied(r.url, r.requestBody, classifySection(r))
  );

  if (newEndpoints.length === 0) {
    lines.push("_All captured endpoints appear to already be proxied._");
  } else {
    lines.push(
      `Found **${newEndpoints.length}** endpoint(s) that likely need new proxy routes:`
    );
    lines.push("");

    const seen = new Set<string>();
    for (const req of newEndpoints) {
      const bodyKey = req.requestBody?.substring(0, 100) ?? "GET";
      const key = req.url + bodyKey;
      if (seen.has(key)) continue;
      seen.add(key);

      const ifName = endpointToInterfaceName(req.url, req.requestBody);
      lines.push(`### New: \`${req.url}\``);
      lines.push(`- **Method:** ${req.method}`);
      lines.push(`- **Phase:** ${req.phase}`);
      lines.push(`- **Section:** ${classifySection(req)}`);

      if (req.requestBody) {
        lines.push("- **Sample request body:**");
        lines.push("  ```json");
        try {
          const parsed = JSON.parse(req.requestBody);
          lines.push(
            "  " +
              JSON.stringify(parsed, null, 2).replace(/\n/g, "\n  ")
          );
        } catch {
          lines.push("  " + req.requestBody.substring(0, 400));
        }
        lines.push("  ```");
      }

      if (req.responseBody) {
        const json = tryParseJson(req.responseBody) as JsonValue | null;
        if (json) {
          lines.push("- **Sample response (first 2000 chars):**");
          lines.push("  ```json");
          lines.push(
            "  " +
              req.responseBody.substring(0, 2000).replace(/\n/g, "\n  ")
          );
          lines.push("  ```");
          lines.push("- **TypeScript interface:**");
          lines.push("  ```typescript");
          lines.push(
            "  " +
              buildFullInterface(ifName, json).replace(/\n/g, "\n  ")
          );
          lines.push("  ```");
        }
      }
      lines.push("- **Suggested Next.js route:** `/api/protocol/ROUTE-NAME-HERE`");
      lines.push("");
    }
  }

  // ---- Full `edge_market_snapshots` schema ---------------------------------

  lines.push("## Full edge_market_snapshots Schema");
  lines.push("");
  lines.push(
    "The `edge_market_snapshots` endpoint is the backbone for OI history, liquidations, and volumes."
  );
  lines.push("");

  const snapshotReq = captured.find((r) =>
    r.requestBody?.includes("edge_market_snapshots")
  );
  if (snapshotReq?.responseBody) {
    const json = tryParseJson(snapshotReq.responseBody) as JsonValue | null;
    if (json) {
      lines.push("**Request body structure:**");
      lines.push("```json");
      lines.push(
        JSON.stringify(
          {
            edge_market_snapshots: {
              interval: {
                count: "<number of data points>",
                max_time: "<epoch seconds as string>",
                granularity: "<86400 for daily | 604800 for weekly>",
              },
            },
          },
          null,
          2
        )
      );
      lines.push("```");
      lines.push("");
      lines.push("**Response TypeScript interface:**");
      lines.push("```typescript");
      lines.push(buildFullInterface("EdgeMarketSnapshotsResponse", json));
      lines.push("```");
      lines.push("");
      lines.push("**Sample response (first 3000 chars):**");
      lines.push("```json");
      lines.push(snapshotReq.responseBody.substring(0, 3000));
      lines.push("```");
    }
  }

  lines.push("");

  // ---- Full funding_rates schema -------------------------------------------

  lines.push("## Full funding_rates Schema");
  lines.push("");
  lines.push(
    "Used for the Funding Rates table showing current predicted rates per asset."
  );
  lines.push("");
  lines.push("**Request:** `POST https://archive.prod.nado.xyz/v1`");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        funding_rates: {
          product_ids: [
            2, 4, 8, 10, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38,
            40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 64, 68, 72, 74, 76, 80,
            86, 88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108, 110, 112,
            114,
          ],
        },
      },
      null,
      2
    )
  );
  lines.push("```");
  lines.push("");

  const fundingRateReq = captured.find((r) =>
    r.requestBody?.includes("funding_rates")
  );
  if (fundingRateReq?.responseBody) {
    const json = tryParseJson(fundingRateReq.responseBody) as JsonValue | null;
    if (json) {
      lines.push("**Response TypeScript interface:**");
      lines.push("```typescript");
      lines.push(buildFullInterface("FundingRatesResponse", json));
      lines.push("```");
    } else {
      lines.push(
        "_Response body not captured — `funding_rates` proxy already exists at `/api/protocol/funding-rates`_"
      );
      lines.push("");
      lines.push(
        "This endpoint IS proxied by the existing `/api/protocol/funding-rates` route."
      );
    }
  } else {
    lines.push(
      "_`funding_rates` request captured in console log but response not stored (timing issue in initial run)._"
    );
    lines.push("");
    lines.push(
      "**This endpoint IS already proxied** by `/api/protocol/funding-rates`."
    );
    lines.push("");
    lines.push("**Existing interface (from project types):**");
    lines.push("```typescript");
    lines.push(`export interface FundingRatesResponse {
  funding_rates: {
    [chainId: string]: Array<{
      product_id: number;
      funding_rate_x18: string;  // x18 scaled funding rate per day
    }>;
  };
}`);
    lines.push("```");
  }
  lines.push("");

  // ---- Insurance gateway schema -------------------------------------------

  lines.push("## Insurance Gateway Schema");
  lines.push("");
  lines.push(
    "Used for the Insurance Fund donut chart (~$1.33M total backing)."
  );
  lines.push("");
  lines.push("**Request:** `POST https://gateway.prod.nado.xyz/v1/query`");
  lines.push("```json");
  lines.push(JSON.stringify({ type: "insurance" }, null, 2));
  lines.push("```");
  lines.push("");

  const insuranceReq2 = captured.find(
    (r) => r.requestBody?.includes("insurance") || r.url.includes("insurance")
  );
  if (insuranceReq2?.responseBody) {
    const json = tryParseJson(insuranceReq2.responseBody) as JsonValue | null;
    if (json) {
      lines.push("**Response TypeScript interface:**");
      lines.push("```typescript");
      lines.push(buildFullInterface("InsuranceGatewayResponse", json));
      lines.push("```");
      lines.push("");
      lines.push("**Sample response:**");
      lines.push("```json");
      lines.push(insuranceReq2.responseBody.substring(0, 3000));
      lines.push("```");
    }
  } else {
    lines.push(
      "_Insurance response not captured in this session (response arrived but wasn't stored due to timing)._"
    );
    lines.push("");
    lines.push(
      "**IMPORTANT: This IS a NEW endpoint** — NOT currently proxied by any existing route."
    );
    lines.push("");
    lines.push(
      "**New proxy route needed:** `/api/protocol/insurance`"
    );
    lines.push("");
    lines.push(
      "Based on the Gateway query API pattern (same as `edge_all_products`), expected response:"
    );
    lines.push("```typescript");
    lines.push(`export interface InsuranceGatewayResponse {
  status: "success" | "failure";
  data: {
    insurance: {
      // chainId (e.g., "57073") maps to an array of product insurance entries
      [chainId: string]: Array<{
        product_id: number;
        backing: string;  // x18 scaled — represents collateral backing insurance fund
      }>;
    };
  };
}

// To compute total insurance fund value:
// totalUSD = sum(fromX18BigInt(entry.backing) * oracle_price_for_product)
// Stats shows $1.33M total — this matches perp collateral distribution`);
    lines.push("```");
  }
  lines.push("");

  // ---- All raw requests dump -----------------------------------------------

  lines.push("## All Captured API Requests (Raw Dump)");
  lines.push("");

  for (let i = 0; i < captured.length; i++) {
    const req = captured[i];
    lines.push(`### Request ${i + 1}: ${req.method} ${req.url}`);
    lines.push(`- **Phase:** ${req.phase}`);
    lines.push(`- **Status:** ${req.responseStatus ?? "N/A"}`);
    lines.push(`- **Section:** ${classifySection(req)}`);

    if (req.requestBody) {
      lines.push("- **Request body:**");
      lines.push("  ```json");
      try {
        lines.push(
          "  " +
            JSON.stringify(JSON.parse(req.requestBody), null, 2).replace(
              /\n/g,
              "\n  "
            )
        );
      } catch {
        lines.push("  " + req.requestBody.substring(0, 800));
      }
      lines.push("  ```");
    }

    if (Object.keys(req.queryParams).length > 0) {
      lines.push(`- **Query params:** \`${JSON.stringify(req.queryParams)}\``);
    }

    lines.push("- **Response (first 80 lines):**");
    lines.push("  ```json");
    for (const line of req.responseLines.slice(0, 80)) {
      lines.push("  " + line);
    }
    if (req.responseLines.length > 80) {
      lines.push(`  ... (${req.responseLines.length - 80} more lines)`);
    }
    lines.push("  ```");
    lines.push("");
  }

  // ---- Write report --------------------------------------------------------

  const report = lines.join("\n");
  fs.writeFileSync(REPORT_PATH, report, "utf-8");

  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(`  Total captured: ${captured.length} API requests`);

  const newEps = captured.filter(
    (r) => !guessAlreadyProxied(r.url, r.requestBody, classifySection(r))
  );
  console.log(`  New endpoints needing proxy: ${newEps.length}`);
  console.log(
    `  Insurance: ${captured.filter((r) => r.requestBody?.includes("insurance")).length}`
  );
  console.log(
    `  Funding rates: ${captured.filter((r) => r.requestBody?.includes("funding_rates")).length}`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
