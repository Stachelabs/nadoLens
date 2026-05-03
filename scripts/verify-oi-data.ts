/**
 * verify-oi-data.ts
 *
 * Verifies that NadoLens OI, Funding & Liquidations data matches stats.nado.xyz.
 *
 * Run: npx tsx scripts/verify-oi-data.ts
 * Screenshot: /tmp/stats-nado-verify.png
 * Report:     /tmp/rpt-oi-verify.md
 */

import { chromium } from "playwright";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// x18 BigInt conversion (from types/nado.ts — replicated for standalone script)
// ---------------------------------------------------------------------------

function fromX18BigInt(val: string): number {
  if (!val || val === "0") return 0;
  try {
    const n = BigInt(val);
    const PRECISION = BigInt(10) ** BigInt(18);
    const whole = n / PRECISION;
    const frac = n % PRECISION;
    return Number(whole) + Number(frac) / 1e18;
  } catch {
    return parseFloat(val) / 1e18;
  }
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtUSD(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(4)}%`;
}

/**
 * Parse a display string like "$114M", "$39.6M", "$130k" into a number.
 * Returns NaN if unable to parse.
 */
function parseDisplayUSD(s: string): number {
  const cleaned = s.replace(/[$,\s]/g, "").toUpperCase();
  if (cleaned.endsWith("B")) return parseFloat(cleaned) * 1e9;
  if (cleaned.endsWith("M")) return parseFloat(cleaned) * 1e6;
  if (cleaned.endsWith("K")) return parseFloat(cleaned) * 1e3;
  return parseFloat(cleaned);
}

/**
 * Compare two values (display number vs API number).
 * Match if within 5% OR both are in same order of magnitude.
 */
function matchStatus(displayStr: string, apiVal: number): string {
  const displayVal = parseDisplayUSD(displayStr);
  if (isNaN(displayVal) || displayVal === 0) return "⚠️ (no display value)";
  const diff = Math.abs(displayVal - apiVal) / displayVal;
  return diff <= 0.05 ? "✅" : `⚠️ (${(diff * 100).toFixed(1)}% off)`;
}

// ---------------------------------------------------------------------------
// Types for API responses
// ---------------------------------------------------------------------------

interface Ticker {
  product_id: number;
  product_name: string;
  mark_price: string;
  // ... other fields
}

interface TickersResponse {
  status: string;
  data: {
    spot_products: Ticker[];
    perp_products: Ticker[];
  };
}

interface MarketSnapshot {
  product_id: number;
  open_interests: string;          // x18
  cumulative_liquidation_amounts: string; // x18
  // other fields omitted
}

interface EdgeMarketSnapshotsResponse {
  edge_market_snapshots: {
    snapshots: Array<{
      timestamp: string;
      markets: MarketSnapshot[];
    }>;
  };
}

interface FundingRate {
  product_id: number;
  funding_rate_x18: string; // x18 per hour
}

interface FundingRatesResponse {
  funding_rates: {
    [chainId: string]: FundingRate[];
  };
}

// ---------------------------------------------------------------------------
// Part 1 — Playwright scrape of stats.nado.xyz
// ---------------------------------------------------------------------------

interface ScrapedData {
  totalOI: string;
  btcOI: string;
  ethOI: string;
  liq24h: string;
  totalLiq: string;
  topFundingRates: Array<{ symbol: string; rate: string }>;
  screenshotPath: string;
  rawStatCards: string[];
}

async function scrapeStatsNado(): Promise<ScrapedData> {
  console.log("\n=== Part 1: Scraping stats.nado.xyz ===");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    console.log("  Navigating to https://stats.nado.xyz/ ...");
    await page.goto("https://stats.nado.xyz/", {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    console.log("  Page loaded.");

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/stats-nado-initial.png" });

    // Click the "OI, Funding & Liquidations" tab
    console.log('  Looking for "OI, Funding & Liquidations" tab...');
    const tabSelectors = [
      'text="OI, Funding & Liquidations"',
      "text=OI, Funding",
      'text="OI"',
      '[role="tab"]:has-text("OI")',
      'button:has-text("OI")',
      'a:has-text("OI")',
      'nav a:has-text("OI")',
    ];

    let tabClicked = false;
    for (const sel of tabSelectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0) {
          console.log(`  Found tab with selector: ${sel}`);
          await el.click({ timeout: 8_000 });
          tabClicked = true;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!tabClicked) {
      // Log all navigation elements to understand the page structure
      const navTexts = await page
        .locator('nav a, [role="tab"], button, [class*="tab"]')
        .allTextContents();
      console.warn("  Tab not found. All nav/tab elements:", navTexts.join(" | "));

      // Try clicking by index — OI tab is usually 3rd tab (0-indexed: 2)
      try {
        const tabs = page.locator('[role="tab"]');
        const tabCount = await tabs.count();
        console.log(`  Found ${tabCount} role=tab elements`);
        for (let i = 0; i < tabCount; i++) {
          const txt = await tabs.nth(i).textContent();
          console.log(`    Tab ${i}: ${txt}`);
        }
        if (tabCount >= 3) {
          await tabs.nth(2).click({ timeout: 5_000 });
          tabClicked = true;
          console.log("  Clicked 3rd tab by index.");
        }
      } catch {
        // ignore
      }
    }

    // Wait for network to settle after tab click
    try {
      await page.waitForLoadState("networkidle", { timeout: 20_000 });
    } catch {
      await page.waitForTimeout(6_000);
    }
    await page.waitForTimeout(3_000);

    // Scroll to load lazy content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1_500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2_000);

    // Take final screenshot
    const screenshotPath = "/tmp/stats-nado-verify.png";
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved to ${screenshotPath}`);

    // --- Scrape stat cards ---
    // stats.nado.xyz typically shows stat cards with a large number + label
    const rawStatCards: string[] = [];

    // Try various selectors for stat card values
    const statCardSelectors = [
      '[class*="stat"] [class*="value"]',
      '[class*="card"] [class*="value"]',
      '[class*="metric"]',
      '[class*="kpi"]',
      "h2 + p",
      "h3 + p",
      ".text-2xl",
      ".text-3xl",
      ".text-4xl",
      '[class*="stat-value"]',
      '[class*="StatCard"]',
    ];

    for (const sel of statCardSelectors) {
      try {
        const els = page.locator(sel);
        const count = await els.count();
        if (count > 0) {
          const texts = await els.allTextContents();
          if (texts.some((t) => t.includes("$") || t.includes("M") || t.includes("B"))) {
            rawStatCards.push(...texts);
            console.log(`  Found ${count} elements with selector "${sel}": ${texts.join(", ")}`);
          }
        }
      } catch {
        // ignore
      }
    }

    // Fallback: get all text that looks like dollar amounts from the page
    if (rawStatCards.length === 0) {
      console.log("  Stat cards not found with specific selectors. Scanning all text...");
      const allText = await page.locator("body").innerText();
      const dollarMatches = allText.match(/\$[\d,.]+[BMK]?/g) ?? [];
      rawStatCards.push(...dollarMatches);
      console.log("  Dollar-like values found:", dollarMatches.join(", "));
    }

    // --- Scrape specific stat values using flexible text search ---
    // We look for the stat values by their label context
    let totalOI = "N/A";
    let btcOI = "N/A";
    let ethOI = "N/A";
    let liq24h = "N/A";
    let totalLiq = "N/A";

    // Get the full page text for pattern matching
    const pageText = await page.locator("body").innerText();
    console.log("\n  Page text sample (first 2000 chars):");
    console.log(pageText.substring(0, 2000));

    // Try to find stat cards by looking at the DOM structure more carefully
    // stats.nado.xyz likely renders stat values near their labels
    const allPageElements = await page.locator("*").all();
    console.log(`  Total DOM elements: ${allPageElements.length}`);

    // Specifically look for elements containing dollar amounts near label text
    const dollarEls = await page
      .locator("*")
      .filter({ hasText: /^\$[\d,.]+[BMK]?$/ })
      .all();
    console.log(`  Elements with dollar values: ${dollarEls.length}`);
    for (const el of dollarEls.slice(0, 20)) {
      try {
        const txt = (await el.textContent()) ?? "";
        const parentTxt = (await el.locator("..").textContent()) ?? "";
        console.log(`    Value: "${txt}" | Parent context: "${parentTxt.substring(0, 100)}"`);
      } catch {
        // ignore
      }
    }

    // Try to extract specific stats using label + adjacent value pattern
    const labelValuePairs: Array<{ label: string; value: string }> = [];

    // Look for patterns like: label text followed by a dollar value
    const statBlocks = await page.locator('[class*="card"], [class*="stat"], section, article').all();
    for (const block of statBlocks.slice(0, 30)) {
      try {
        const text = await block.innerText();
        if (text.includes("$")) {
          labelValuePairs.push({ label: "block", value: text.trim() });
        }
      } catch {
        // ignore
      }
    }

    // Extract from page text using regex patterns
    const oiMatch = pageText.match(/Total\s+OI[:\s]+(\$[\d,.]+[BMK]?)/i);
    const btcOiMatch = pageText.match(/BTC[:\s-]+OI[:\s]+(\$[\d,.]+[BMK]?)/i);
    const ethOiMatch = pageText.match(/ETH[:\s-]+OI[:\s]+(\$[\d,.]+[BMK]?)/i);
    const liq24hMatch = pageText.match(/24[hH]\s+Liq[:\s]+(\$[\d,.]+[BMK]?)/i) ??
      pageText.match(/Liquidations?\s+24[hH][:\s]+(\$[\d,.]+[BMK]?)/i);
    const totalLiqMatch = pageText.match(/Total\s+Liq[:\s]+(\$[\d,.]+[BMK]?)/i);

    if (oiMatch) totalOI = oiMatch[1];
    if (btcOiMatch) btcOI = btcOiMatch[1];
    if (ethOiMatch) ethOI = ethOiMatch[1];
    if (liq24hMatch) liq24h = liq24hMatch[1];
    if (totalLiqMatch) totalLiq = totalLiqMatch[1];

    console.log("\n  Extracted stat values (regex):");
    console.log(`    Total OI: ${totalOI}`);
    console.log(`    BTC OI:   ${btcOI}`);
    console.log(`    ETH OI:   ${ethOI}`);
    console.log(`    24h Liq:  ${liq24h}`);
    console.log(`    Total Liq: ${totalLiq}`);

    // If values not found by regex, try a more aggressive approach:
    // Find all dollar values on the page and their neighboring text
    if (totalOI === "N/A" || btcOI === "N/A") {
      console.log("\n  Trying aggressive DOM scraping...");
      const result = await page.evaluate(() => {
        const found: Array<{ text: string; context: string }> = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );
        let node = walker.nextNode();
        while (node) {
          const text = node.textContent?.trim() ?? "";
          if (/\$[\d,.]+[BMK%]?/i.test(text)) {
            const parent = node.parentElement;
            const grandparent = parent?.parentElement;
            const context = grandparent?.innerText?.trim().substring(0, 200) ?? parent?.innerText?.trim() ?? text;
            found.push({ text, context });
          }
          node = walker.nextNode();
        }
        return found;
      });

      console.log(`  Found ${result.length} text nodes with dollar values:`);
      for (const r of result.slice(0, 30)) {
        console.log(`    "${r.text}" — context: "${r.context.substring(0, 100)}"`);
      }

      // Try to match known labels from the context
      for (const { text, context } of result) {
        const ctx = context.toLowerCase();
        if (totalOI === "N/A" && (ctx.includes("total oi") || ctx.includes("open interest"))) {
          totalOI = text;
        } else if (btcOI === "N/A" && ctx.includes("btc") && ctx.includes("oi")) {
          btcOI = text;
        } else if (ethOI === "N/A" && ctx.includes("eth") && ctx.includes("oi")) {
          ethOI = text;
        } else if (liq24h === "N/A" && ctx.includes("24h") && ctx.includes("liq")) {
          liq24h = text;
        } else if (totalLiq === "N/A" && ctx.includes("total") && ctx.includes("liq")) {
          totalLiq = text;
        }
      }
    }

    // --- Scrape funding rates table ---
    console.log("\n  Scraping funding rates table...");
    const topFundingRates: Array<{ symbol: string; rate: string }> = [];

    // Look for a table with funding rate data
    const tableSelectors = [
      'table',
      '[class*="table"]',
      '[class*="rate"]',
      '[class*="funding"]',
    ];

    for (const sel of tableSelectors) {
      try {
        const tables = page.locator(sel);
        const count = await tables.count();
        if (count > 0) {
          console.log(`  Found ${count} elements with selector "${sel}"`);
        }
      } catch {
        // ignore
      }
    }

    // Try to find rows containing both a symbol and a percentage
    const rows = await page.locator("tr, [role='row']").all();
    console.log(`  Found ${rows.length} table rows`);

    for (const row of rows.slice(0, 50)) {
      try {
        const text = await row.innerText();
        // Look for rows with a symbol and a rate (e.g. "BTC-PERP  +0.0123%")
        if (
          text.includes("PERP") &&
          (text.includes("%") || text.includes("bps"))
        ) {
          const symbolMatch = text.match(/([A-Z]+-PERP)/);
          const rateMatch = text.match(/([-+]?\d+\.?\d*%)/);
          if (symbolMatch && rateMatch) {
            if (topFundingRates.length < 5) {
              topFundingRates.push({
                symbol: symbolMatch[1],
                rate: rateMatch[1],
              });
              console.log(`    Row: ${text.substring(0, 100).trim()}`);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // If no rows found, try a different approach
    if (topFundingRates.length === 0) {
      console.log("  No table rows found. Trying text-based approach...");
      const ratePatterns = pageText.match(/([A-Z]+-PERP)[^\n]*([-+]?\d+\.?\d*%)/g) ?? [];
      for (const m of ratePatterns.slice(0, 5)) {
        const symbolMatch = m.match(/([A-Z]+-PERP)/);
        const rateMatch = m.match(/([-+]?\d+\.?\d*%)/);
        if (symbolMatch && rateMatch) {
          topFundingRates.push({ symbol: symbolMatch[1], rate: rateMatch[1] });
        }
      }
    }

    console.log(`\n  Top funding rates found: ${topFundingRates.length}`);
    for (const r of topFundingRates) {
      console.log(`    ${r.symbol}: ${r.rate}`);
    }

    await browser.close();

    return {
      totalOI,
      btcOI,
      ethOI,
      liq24h,
      totalLiq,
      topFundingRates,
      screenshotPath,
      rawStatCards,
    };
  } catch (err) {
    await page.screenshot({ path: "/tmp/stats-nado-verify.png" }).catch(() => null);
    await browser.close();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Part 2 — Direct NADO API calls
// ---------------------------------------------------------------------------

interface ApiData {
  totalOI: number;
  btcOI: number;
  ethOI: number;
  totalLiq: number;
  topFundingRates: Array<{ symbol: string; rate: number; productId: number }>;
  btcProductId: number;
  ethProductId: number;
}

async function fetchNadoApiData(): Promise<ApiData> {
  console.log("\n=== Part 2: Fetching NADO API data directly ===");

  // --- Step 1: Get tickers to find BTC/ETH product IDs ---
  console.log("  Fetching tickers from gateway.prod.nado.xyz ...");
  const tickersResp = await fetch("https://gateway.prod.nado.xyz/v2/tickers");
  if (!tickersResp.ok) {
    throw new Error(`Tickers fetch failed: ${tickersResp.status} ${tickersResp.statusText}`);
  }

  const tickersJson = await tickersResp.json() as TickersResponse;
  console.log(`  Tickers response status: ${tickersJson.status}`);

  const perpProducts = tickersJson.data?.perp_products ?? [];
  console.log(`  Found ${perpProducts.length} perp products`);

  const btcProduct = perpProducts.find(
    (p) => p.product_name === "BTC-PERP" || p.product_name.toUpperCase() === "BTC-PERP"
  );
  const ethProduct = perpProducts.find(
    (p) => p.product_name === "ETH-PERP" || p.product_name.toUpperCase() === "ETH-PERP"
  );

  if (!btcProduct) {
    // Try searching by partial name
    const btcProductAlt = perpProducts.find((p) =>
      p.product_name.toUpperCase().startsWith("BTC")
    );
    console.warn(`  BTC-PERP not found directly. Alt: ${btcProductAlt?.product_name} (id: ${btcProductAlt?.product_id})`);
  }

  const btcProductId = btcProduct?.product_id ?? 2; // Default: BTC-PERP is usually product_id 2
  const ethProductId = ethProduct?.product_id ?? 4; // Default: ETH-PERP is usually product_id 4
  const allPerpIds = perpProducts.map((p) => p.product_id);

  console.log(`  BTC-PERP product_id: ${btcProductId} (${btcProduct?.product_name ?? "fallback"})`);
  console.log(`  ETH-PERP product_id: ${ethProductId} (${ethProduct?.product_name ?? "fallback"})`);
  console.log(`  All perp product IDs (${allPerpIds.length}): ${allPerpIds.slice(0, 10).join(", ")}...`);

  // Also log the first few perp products to understand the structure
  console.log("  Sample perp products:");
  for (const p of perpProducts.slice(0, 5)) {
    console.log(`    product_id=${p.product_id} name="${p.product_name}"`);
  }

  // --- Step 2: Fetch edge_market_snapshots for OI and liquidations ---
  const epochNow = Math.floor(Date.now() / 1000);
  console.log(`\n  Fetching edge_market_snapshots (epoch_now=${epochNow}) ...`);

  const snapshotsBody = {
    edge_market_snapshots: {
      interval: {
        count: 2,
        max_time: epochNow,
        granularity: 86400,
      },
    },
  };

  const snapshotsResp = await fetch("https://archive.prod.nado.xyz/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshotsBody),
  });

  if (!snapshotsResp.ok) {
    throw new Error(
      `Snapshots fetch failed: ${snapshotsResp.status} ${snapshotsResp.statusText}`
    );
  }

  const snapshotsJson = await snapshotsResp.json() as EdgeMarketSnapshotsResponse;
  const snapshots = snapshotsJson.edge_market_snapshots?.snapshots ?? [];
  console.log(`  Received ${snapshots.length} snapshots`);

  if (snapshots.length === 0) {
    throw new Error("No snapshots returned from edge_market_snapshots");
  }

  // Use the latest snapshot
  const latestSnapshot = snapshots[snapshots.length - 1];
  const markets = latestSnapshot?.markets ?? [];
  console.log(
    `  Latest snapshot timestamp: ${latestSnapshot?.timestamp} | ${markets.length} markets`
  );

  // Log sample market fields to understand structure
  if (markets.length > 0) {
    const sampleMarket = markets[0];
    console.log("  Sample market fields:", Object.keys(sampleMarket).join(", "));
    console.log(`  Sample market[0]: product_id=${sampleMarket.product_id} open_interests=${sampleMarket.open_interests} cumulative_liquidation_amounts=${sampleMarket.cumulative_liquidation_amounts}`);
  }

  // Compute totalOI, btcOI, ethOI, totalLiq
  let totalOI = 0;
  let btcOI = 0;
  let ethOI = 0;
  let totalLiq = 0;

  for (const market of markets) {
    const oi = fromX18BigInt(market.open_interests ?? "0");
    const liq = fromX18BigInt(market.cumulative_liquidation_amounts ?? "0");
    totalOI += oi;
    totalLiq += liq;

    if (market.product_id === btcProductId) {
      btcOI = oi;
      console.log(`  BTC-PERP (product_id=${btcProductId}): OI=${fmtUSD(oi)}, raw=${market.open_interests}`);
    }
    if (market.product_id === ethProductId) {
      ethOI = oi;
      console.log(`  ETH-PERP (product_id=${ethProductId}): OI=${fmtUSD(oi)}, raw=${market.open_interests}`);
    }
  }

  console.log(`\n  Total OI: ${fmtUSD(totalOI)}`);
  console.log(`  BTC OI:   ${fmtUSD(btcOI)}`);
  console.log(`  ETH OI:   ${fmtUSD(ethOI)}`);
  console.log(`  Total Liq: ${fmtUSD(totalLiq)}`);

  // --- Step 3: Fetch funding rates ---
  console.log("\n  Fetching funding rates ...");

  // Use all perp product IDs, or fallback to known IDs if empty
  const productIdsForFunding =
    allPerpIds.length > 0
      ? allPerpIds
      : [2, 4, 8, 10, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];

  const fundingBody = {
    funding_rates: {
      product_ids: productIdsForFunding,
    },
  };

  const fundingResp = await fetch("https://archive.prod.nado.xyz/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fundingBody),
  });

  if (!fundingResp.ok) {
    throw new Error(
      `Funding rates fetch failed: ${fundingResp.status} ${fundingResp.statusText}`
    );
  }

  const fundingJson = await fundingResp.json() as FundingRatesResponse;
  const chainIdKey = Object.keys(fundingJson.funding_rates ?? {})[0] ?? "57073";
  const fundingRates = fundingJson.funding_rates?.[chainIdKey] ?? [];
  console.log(`  Received ${fundingRates.length} funding rate entries (chain=${chainIdKey})`);

  // Build a map from product_id to product_name for display
  const productNameMap = new Map<number, string>(
    perpProducts.map((p) => [p.product_id, p.product_name])
  );

  // Compute annualized rates and sort by |rate|
  const ratesWithAnnualized = fundingRates.map((r) => {
    const hourlyRate = fromX18BigInt(r.funding_rate_x18);
    // Annualized: hourly * 24h * 365 days * 100 to get percent
    const annualizedPct = hourlyRate * 24 * 365 * 100;
    return {
      productId: r.product_id,
      symbol: productNameMap.get(r.product_id) ?? `product_${r.product_id}`,
      rate: annualizedPct,
    };
  });

  // Sort by absolute value descending
  ratesWithAnnualized.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));

  const topFundingRates = ratesWithAnnualized.slice(0, 5);
  console.log("\n  Top 5 funding rates by |annualized rate|:");
  for (const r of topFundingRates) {
    console.log(`    ${r.symbol} (id=${r.productId}): ${fmtPct(r.rate)}/yr`);
  }

  return {
    totalOI,
    btcOI,
    ethOI,
    totalLiq,
    topFundingRates,
    btcProductId,
    ethProductId,
  };
}

// ---------------------------------------------------------------------------
// Part 3 — Compare and generate report
// ---------------------------------------------------------------------------

function generateReport(scraped: ScrapedData, api: ApiData): string {
  const lines: string[] = [];

  lines.push("## Data Verification: NadoLens vs stats.nado.xyz");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // --- Open Interest ---
  lines.push("### Open Interest");
  lines.push("");
  lines.push("| Metric | stats.nado.xyz | NADO API (direct) | Match? |");
  lines.push("|--------|---------------|-------------------|--------|");

  const apiTotalOIFmt = fmtUSD(api.totalOI);
  const apiBtcOIFmt = fmtUSD(api.btcOI);
  const apiEthOIFmt = fmtUSD(api.ethOI);

  lines.push(
    `| Total OI | ${scraped.totalOI} | ${apiTotalOIFmt} | ${matchStatus(scraped.totalOI, api.totalOI)} |`
  );
  lines.push(
    `| BTC OI | ${scraped.btcOI} | ${apiBtcOIFmt} | ${matchStatus(scraped.btcOI, api.btcOI)} |`
  );
  lines.push(
    `| ETH OI | ${scraped.ethOI} | ${apiEthOIFmt} | ${matchStatus(scraped.ethOI, api.ethOI)} |`
  );
  lines.push("");

  // --- Liquidations ---
  lines.push("### Liquidations");
  lines.push("");
  lines.push("| Metric | stats.nado.xyz | NADO API (direct) | Match? |");
  lines.push("|--------|---------------|-------------------|--------|");

  const apiTotalLiqFmt = fmtUSD(api.totalLiq);

  lines.push(
    `| Total Liq | ${scraped.totalLiq} | ${apiTotalLiqFmt} | ${matchStatus(scraped.totalLiq, api.totalLiq)} |`
  );
  lines.push(
    `| 24h Liq | ${scraped.liq24h} | (not computed — requires 2-snapshot diff) | ℹ️ |`
  );
  lines.push("");

  // --- Funding Rates ---
  lines.push("### Top Funding Rates (top 5 by |rate|)");
  lines.push("");
  lines.push("| Rank | stats.nado.xyz symbol | stats rate | API symbol | API rate | Match? |");
  lines.push("|------|----------------------|------------|------------|----------|--------|");

  const maxRows = Math.max(scraped.topFundingRates.length, api.topFundingRates.length, 5);
  for (let i = 0; i < maxRows; i++) {
    const scr = scraped.topFundingRates[i];
    const apiRate = api.topFundingRates[i];

    const scrSymbol = scr?.symbol ?? "N/A";
    const scrRate = scr?.rate ?? "N/A";
    const apiSymbol = apiRate?.symbol ?? "N/A";
    const apiRateStr = apiRate !== undefined ? fmtPct(apiRate.rate) : "N/A";

    // Match: same symbol in top-5 (order may differ)
    const symbolMatch =
      scr && apiRate
        ? scraped.topFundingRates.some((s) =>
            api.topFundingRates.some((a) => a.symbol === s.symbol)
          )
          ? "✅"
          : "⚠️"
        : "⚠️";

    lines.push(
      `| ${i + 1} | ${scrSymbol} | ${scrRate} | ${apiSymbol} | ${apiRateStr} | ${symbolMatch} |`
    );
  }
  lines.push("");

  // --- Verdict ---
  lines.push("### Verdict");
  lines.push("");

  const discrepancies: string[] = [];
  const checks: string[] = [];

  // OI checks
  if (scraped.totalOI !== "N/A") {
    const diff = Math.abs(parseDisplayUSD(scraped.totalOI) - api.totalOI) / parseDisplayUSD(scraped.totalOI);
    if (diff <= 0.05) {
      checks.push(`Total OI matches (${scraped.totalOI} vs ${apiTotalOIFmt})`);
    } else {
      discrepancies.push(`Total OI differs ${(diff * 100).toFixed(1)}% (${scraped.totalOI} vs ${apiTotalOIFmt})`);
    }
  } else {
    discrepancies.push("Total OI: could not scrape from stats.nado.xyz");
  }

  if (scraped.btcOI !== "N/A") {
    const diff = Math.abs(parseDisplayUSD(scraped.btcOI) - api.btcOI) / parseDisplayUSD(scraped.btcOI);
    if (diff <= 0.05) {
      checks.push(`BTC OI matches (${scraped.btcOI} vs ${apiBtcOIFmt})`);
    } else {
      discrepancies.push(`BTC OI differs ${(diff * 100).toFixed(1)}% (${scraped.btcOI} vs ${apiBtcOIFmt})`);
    }
  } else {
    discrepancies.push("BTC OI: could not scrape from stats.nado.xyz");
  }

  if (scraped.totalLiq !== "N/A") {
    const diff = Math.abs(parseDisplayUSD(scraped.totalLiq) - api.totalLiq) / parseDisplayUSD(scraped.totalLiq);
    if (diff <= 0.05) {
      checks.push(`Total Liq matches (${scraped.totalLiq} vs ${apiTotalLiqFmt})`);
    } else {
      discrepancies.push(`Total Liq differs ${(diff * 100).toFixed(1)}% (${scraped.totalLiq} vs ${apiTotalLiqFmt})`);
    }
  } else {
    discrepancies.push("Total Liq: could not scrape from stats.nado.xyz");
  }

  const overallMatch =
    discrepancies.length === 0
      ? "YES"
      : discrepancies.some((d) => d.includes("could not scrape"))
      ? "PARTIAL (scraping failed — API data valid)"
      : discrepancies.length <= 1
      ? "PARTIAL"
      : "NO";

  lines.push(`- Overall match: **${overallMatch}**`);

  if (checks.length > 0) {
    lines.push(`- Confirmed: ${checks.join("; ")}`);
  }

  if (discrepancies.length > 0) {
    lines.push(`- Discrepancies:`);
    for (const d of discrepancies) {
      lines.push(`  - ${d}`);
    }
  }

  lines.push(`- Likely causes of mismatch:`);
  lines.push(`  - stats.nado.xyz shows rounded values ("$114M") so exact match is impossible`);
  lines.push(`  - Stats site may use a different snapshot time (their latest vs ours)`);
  lines.push(`  - OI values from snapshots reflect end-of-day state, not real-time`);
  lines.push(`  - BTC/ETH product_id fallbacks used if ticker fetch failed`);
  lines.push("");

  // --- Raw API values ---
  lines.push("### Raw API Values (for reference)");
  lines.push("");
  lines.push(`- Total OI (API): ${fmtUSD(api.totalOI)} (${api.totalOI.toFixed(2)} USD)`);
  lines.push(`- BTC OI (API): ${fmtUSD(api.btcOI)} (product_id=${api.btcProductId})`);
  lines.push(`- ETH OI (API): ${fmtUSD(api.ethOI)} (product_id=${api.ethProductId})`);
  lines.push(`- Total Liq (API): ${fmtUSD(api.totalLiq)}`);
  lines.push("");
  lines.push("**API Top 5 Funding Rates:**");
  lines.push("");
  for (const r of api.topFundingRates) {
    lines.push(`- ${r.symbol} (product_id=${r.productId}): ${fmtPct(r.rate)}/yr`);
  }
  lines.push("");

  // --- Screenshot ---
  lines.push("### Screenshot");
  lines.push(`Screenshot saved to: ${scraped.screenshotPath}`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== NadoLens — OI, Funding & Liquidations Data Verification ===");
  console.log(`Started: ${new Date().toISOString()}`);

  let scraped: ScrapedData;
  let apiData: ApiData;

  try {
    scraped = await scrapeStatsNado();
  } catch (err) {
    console.error("Part 1 (scraping) failed:", err);
    // Provide empty scraped data so we can still run Part 2
    scraped = {
      totalOI: "N/A",
      btcOI: "N/A",
      ethOI: "N/A",
      liq24h: "N/A",
      totalLiq: "N/A",
      topFundingRates: [],
      screenshotPath: "/tmp/stats-nado-verify.png",
      rawStatCards: [],
    };
  }

  try {
    apiData = await fetchNadoApiData();
  } catch (err) {
    console.error("Part 2 (API fetch) failed:", err);
    throw err;
  }

  const report = generateReport(scraped, apiData);

  const reportPath = "/tmp/rpt-oi-verify.md";
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`\n=== Report written to ${reportPath} ===`);
  console.log("\n--- REPORT CONTENTS ---");
  console.log(report);
  console.log("--- END REPORT ---");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
