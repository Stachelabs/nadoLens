/**
 * sync-nado-perp-svgs.ts
 *
 * Downloads perp market header SVGs from the Nado web app (same assets as app.nado.xyz
 * under /_next/static/media/*.svg). Uses Gateway GET /v2/assets (perps only) and visits
 * /perpetuals?market=<BASE> where BASE is the segment before the first "-" in symbol
 * (e.g. AAVE-PERP → AAVE).
 *
 * Usage:
 *   pnpm icons:sync-nado-perps
 *
 * Env:
 *   NADO_GATEWAY_V2      — default https://gateway.prod.nado.xyz/v2
 *   ICONS_OUTPUT_DIR     — default public/icons/perps
 *   PLAYWRIGHT_CDP_URL   — optional, e.g. http://127.0.0.1:9222 (see header comment for Rabby)
 *   PLAYWRIGHT_HEADED    — set to "1" to show browser when not using CDP
 *   ICONS_DELAY_MS       — extra wait after navigation (default 800)
 *   ICONS_ONLY           — comma-separated market keys to fetch (e.g. BTC,ETH)
 *
 * Rabby / wallet: Playwright cannot "inject" a browser extension into its bundled Chromium.
 * Use Chrome with remote debugging and connect via CDP so your existing Rabby + site session applies:
 *   1) Close Chrome completely.
 *   2) Start: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *        --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-playwright-profile"
 *   3) Install Rabby in that profile, connect to app.nado.xyz once if needed.
 *   4) PLAYWRIGHT_CDP_URL=http://127.0.0.1:9222 pnpm icons:sync-nado-perps
 *
 * Without CDP, icons often still load on /perpetuals (public page); use CDP if the app blocks assets until connected.
 *
 * Private Beta (app.nado.xyz): unauthenticated sessions see a referral wall — no market SVGs load.
 * Set NADO_APP_REFERRAL_CODE so the script opens https://app.nado.xyz?join=<code> (and falls back to
 * filling the "Referral Code" field if the gate persists). Never commit real codes; use .env.local only.
 * If you use PLAYWRIGHT_CDP_URL with Chrome where you already passed the gate + Rabby, you can omit the code.
 */

import { createHash } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "url";

import { config } from "dotenv";
import { chromium, type Browser, type Page } from "playwright";

import { NADO_GATEWAY_V2 } from "../lib/nado";
import { V2AssetsResponseSchema } from "../lib/schemas/nado";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

config({ path: join(REPO_ROOT, ".env.local") });
config();

const NADO_APP = "https://app.nado.xyz";

type PerpRow = {
  product_id: number;
  symbol: string;
  marketKey: string;
};

type SvgCapture = { url: string; body: Buffer };

type ManifestEntry = {
  marketKey: string;
  product_id: number;
  symbol: string;
  status: "ok" | "skipped_not_on_app" | "skipped_no_svg" | "error";
  finalUrl?: string;
  pickedUrl?: string;
  sha256?: string;
  bytes?: number;
  message?: string;
};

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function parseOnlyFilter(): Set<string> | null {
  const raw = process.env.ICONS_ONLY?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

async function fetchPerps(gatewayV2: string): Promise<PerpRow[]> {
  const res = await fetch(`${gatewayV2.replace(/\/$/, "")}/assets`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET /assets failed: ${res.status}`);
  const raw: unknown = await res.json();
  const parsed = V2AssetsResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("GET /assets: invalid JSON (Zod)");

  const out: PerpRow[] = [];
  for (const a of parsed.data) {
    if (a.market_type !== "perp") continue;
    const dash = a.symbol.indexOf("-");
    if (dash <= 0) continue;
    const marketKey = a.symbol.slice(0, dash);
    if (!marketKey) continue;
    out.push({ product_id: a.product_id, symbol: a.symbol, marketKey });
  }
  return out;
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").pop() ?? "";
    return seg.split("?")[0] ?? "";
  } catch {
    return "";
  }
}

function isNoiseSvgUrl(url: string): boolean {
  const name = filenameFromUrl(url).toLowerCase();
  // Root-level /icon-*.svg on app.nado.xyz is site chrome (often Nado mark), not market assets.
  if (name.startsWith("icon-")) return true;
  return (
    name.includes("nado-logo") ||
    name.includes("nado-brand") ||
    name.includes("nado-brand-icon")
  );
}

/** Only Next hashed assets: btc.<hash>.svg — not /icon-*.svg favicons. */
function isNextMediaAssetUrl(url: string): boolean {
  return url.includes("/_next/static/media/") && url.toLowerCase().includes(".svg");
}

function pickSvgForMarket(marketKey: string, caps: SvgCapture[]): SvgCapture | null {
  const lower = marketKey.toLowerCase();
  const clean = caps.filter(
    (c) => !isNoiseSvgUrl(c.url) && isNextMediaAssetUrl(c.url),
  );
  const byPrefix = clean.filter((c) => {
    const name = filenameFromUrl(c.url).toLowerCase();
    return name.startsWith(`${lower}.`) || name.startsWith(`${lower}_`);
  });
  if (byPrefix.length === 1) return byPrefix[0] ?? null;
  if (byPrefix.length > 1) {
    byPrefix.sort((a, b) => b.body.length - a.body.length);
    return byPrefix[0] ?? null;
  }
  return null;
}

/** Collect absolute URLs for Next media assets (img + next/image patterns). */
async function collectMediaSvgUrls(page: Page): Promise<string[]> {
  // No arrow callbacks inside evaluate — tsx can inject helpers that break in the browser (__name).
  return page.evaluate(function collectMediaSvgUrlsInPage() {
    const out: string[] = [];
    function push(u: string | null) {
      if (u && u.includes("/_next/static/media/") && u.includes(".svg")) out.push(u);
    }
    const imgList = document.querySelectorAll("img");
    for (let i = 0; i < imgList.length; i++) {
      const el = imgList[i];
      push(el.currentSrc || el.src);
      push(el.getAttribute("src"));
    }
    const sources = document.querySelectorAll("source[srcset]");
    for (let i = 0; i < sources.length; i++) {
      const el = sources[i];
      const first = el.srcset.split(",")[0]?.trim().split(/\s+/)[0];
      push(first ?? null);
    }
    return [...new Set(out)];
  });
}

/** Fetch SVG from resolved img src (Next /_next/static/media/… only). */
async function fetchSvgFromImgSrc(
  page: Page,
  src: string | null,
): Promise<SvgCapture | null> {
  if (!src || !src.includes(".svg")) return null;
  const base = page.url();
  const abs = new URL(src, base).href;
  if (isNoiseSvgUrl(abs) || !isNextMediaAssetUrl(abs)) return null;
  const res = await page.context().request.get(abs);
  if (!res.ok()) return null;
  const body = Buffer.from(await res.body());
  return { url: abs, body };
}

/**
 * Prefer the icon Nado actually shows for this route: market switcher header img
 * (see data-testid on app.nado.xyz). Works when filename slug ≠ short ticker (e.g. long names).
 */
async function pickSvgFromMarketSwitcher(
  page: Page,
  marketKey: string,
): Promise<SvgCapture | null> {
  const trigger = page.locator('[data-testid="trading-market-switcher-trigger"]');
  if (!(await trigger.isVisible().catch(() => false))) return null;

  const imgs = trigger.locator("img");
  const n = await imgs.count();
  const want = marketKey.toUpperCase();

  for (let i = 0; i < n; i++) {
    const img = imgs.nth(i);
    const alt = (await img.getAttribute("alt"))?.trim().toUpperCase();
    if (alt && alt !== want) continue;
    const src = await img.getAttribute("src");
    const cap = await fetchSvgFromImgSrc(page, src);
    if (cap) return cap;
  }

  if (n > 0) {
    const src = await imgs.nth(0).getAttribute("src");
    return fetchSvgFromImgSrc(page, src);
  }
  return null;
}

/**
 * Open the market menu (Radix), Perps tab, and match the row by img[alt] ≈ ticker.
 * Same canonical list as the UI; paths are /_next/static/media/&lt;ticker&gt;.&lt;hash&gt;.svg
 */
async function pickSvgFromPerpsDropdown(
  page: Page,
  marketKey: string,
): Promise<SvgCapture | null> {
  const want = marketKey.trim().toLowerCase();
  const trigger = page.locator(
    '[data-testid="trading-market-switcher-trigger"]',
  );
  if (!(await trigger.isVisible().catch(() => false))) return null;

  try {
    await trigger.click({ timeout: 10_000 });
    const wrapper = page.locator("[data-radix-popper-content-wrapper]").first();
    await wrapper.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
    if (!(await wrapper.isVisible().catch(() => false))) return null;

    await page
      .getByRole("tab", { name: /^perps$/i })
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});

    const imgs = wrapper.locator('img[src*="/_next/static/media/"]');
    const n = await imgs.count();
    for (let i = 0; i < n; i++) {
      const img = imgs.nth(i);
      const alt = (await img.getAttribute("alt"))?.trim().toLowerCase();
      if (alt !== want) continue;
      const src = await img.getAttribute("src");
      const cap = await fetchSvgFromImgSrc(page, src);
      if (cap) return cap;
    }
    return null;
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(250);
  }
}

/** When network capture misses (hashed filenames), resolve from DOM + GET. */
async function pickSvgFromDom(
  page: Page,
  marketKey: string,
): Promise<SvgCapture | null> {
  const fromSwitcher = await pickSvgFromMarketSwitcher(page, marketKey);
  if (fromSwitcher) return fromSwitcher;

  const fromDropdown = await pickSvgFromPerpsDropdown(page, marketKey);
  if (fromDropdown) return fromDropdown;

  const lower = marketKey.toLowerCase();
  const urls = await collectMediaSvgUrls(page);

  for (const href of urls) {
    const name = filenameFromUrl(href).toLowerCase();
    if (!name.startsWith(`${lower}.`) && !name.startsWith(`${lower}_`)) continue;
    const got = await fetchSvgFromImgSrc(page, href);
    if (got) return got;
  }

  return null;
}

function isLikelySvgResponse(url: string, contentType: string): boolean {
  if (!isNextMediaAssetUrl(url)) return false;
  const ct = contentType.toLowerCase();
  if (ct.includes("svg")) return true;
  const name = filenameFromUrl(url).toLowerCase();
  return name.endsWith(".svg");
}

async function attachSvgCollector(
  page: Page,
  onSvg: (cap: SvgCapture) => void,
): Promise<() => void> {
  const handler = async (response: import("playwright").Response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] ?? "";
    if (!isLikelySvgResponse(url, ct)) return;
    try {
      const body = await response.body();
      if (body.length === 0) return;
      const text = body.toString("utf8").trimStart();
      if (!text.includes("<svg") && !text.includes("<?xml")) return;
      onSvg({ url, body });
    } catch {
      // aborted body, etc.
    }
  };
  page.on("response", handler);
  return () => {
    page.off("response", handler);
  };
}

async function connectBrowser(): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const cdp = process.env.PLAYWRIGHT_CDP_URL?.trim();
  if (cdp) {
    const browser = await chromium.connectOverCDP(cdp);
    return {
      browser,
      close: async () => {
        await browser.close();
      },
    };
  }
  const headed = process.env.PLAYWRIGHT_HEADED === "1";
  const browser = await chromium.launch({ headless: !headed });
  return {
    browser,
    close: async () => {
      await browser.close();
    },
  };
}

async function getOrCreatePage(browser: Browser): Promise<Page> {
  const contexts = browser.contexts();
  if (contexts.length > 0) {
    const ctx = contexts[0];
    if (!ctx) throw new Error("No browser context");
    const pages = ctx.pages();
    if (pages.length > 0 && pages[0]) return pages[0];
    return await ctx.newPage();
  }
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  return await ctx.newPage();
}

/** True when the perp row exists in Gateway but the web app has no selectable market (dead / not listed in UI). */
async function isChooseMarketSwitcher(page: Page): Promise<boolean> {
  const trigger = page.locator(
    '[data-testid="trading-market-switcher-trigger"]',
  );
  if (!(await trigger.isVisible().catch(() => false))) return false;
  const text = (await trigger.innerText()).replace(/\s+/g, " ").trim();
  return /choose\s+market/i.test(text);
}

async function isPrivateBetaGateVisible(page: Page): Promise<boolean> {
  const referral = page.getByPlaceholder(/referral/i).first();
  if (await referral.isVisible().catch(() => false)) return true;
  const beta = page.getByText(/private\s*beta/i).first();
  return beta.isVisible().catch(() => false);
}

/**
 * Unlocks the Nado web app when the "Private Beta" wall is shown (no market icons until then).
 * @param referralCode — from env NADO_APP_REFERRAL_CODE; optional if CDP session is already allowed.
 */
async function ensureNadoAppAccess(
  page: Page,
  referralCode: string | undefined,
): Promise<void> {
  if (process.env.ICONS_SKIP_REFERRAL === "1") {
    console.warn(
      "[icons] ICONS_SKIP_REFERRAL=1 — skipping gate check (use only with an already-authorized CDP profile).",
    );
    return;
  }

  await page.goto(`${NADO_APP}/perpetuals?market=BTC`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await sleep(1_000);

  if (!(await isPrivateBetaGateVisible(page))) {
    console.log("[icons] No Private Beta gate — continuing.");
    return;
  }

  const code = referralCode?.trim();
  if (!code) {
    throw new Error(
      "app.nado.xyz shows Private Beta. Set NADO_APP_REFERRAL_CODE in .env.local (e.g. from ?join=YOURCODE) " +
        "or use PLAYWRIGHT_CDP_URL with Chrome/Rabby where the gate is already cleared.",
    );
  }

  const joinUrl = `${NADO_APP}/?join=${encodeURIComponent(code)}`;
  console.log("[icons] Opening referral join URL, then reloading /perpetuals to verify…");

  const reloadPerpsProbe = async (): Promise<boolean> => {
    await page.goto(`${NADO_APP}/perpetuals?market=BTC`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await sleep(1_500);
    return isPrivateBetaGateVisible(page);
  };

  await page.goto(joinUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await sleep(2_000);

  if (!(await reloadPerpsProbe())) {
    console.log("[icons] Gate cleared after ?join=.");
    return;
  }

  const input = page.getByPlaceholder(/referral/i).first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(code);
    const btn = page.getByRole("button", { name: /enter referral code/i });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await input.press("Enter");
    }
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await sleep(2_000);
  }

  if (!(await reloadPerpsProbe())) {
    console.log("[icons] Gate cleared after referral form.");
    return;
  }

  throw new Error(
    "Still on Private Beta after referral. Nado often requires a connected wallet (Rabby) for the code to " +
      "stick — use PLAYWRIGHT_CDP_URL=http://127.0.0.1:9222 with Chrome + Rabby already logged in, " +
      "then set NADO_APP_REFERRAL_CODE and run again (or ICONS_SKIP_REFERRAL=1 if the gate is already cleared).",
  );
}

async function main(): Promise<void> {
  const gatewayV2 = envStr("NADO_GATEWAY_V2", NADO_GATEWAY_V2);
  const outDir = envStr("ICONS_OUTPUT_DIR", join(REPO_ROOT, "public", "icons", "perps"));
  const delayMs = Number.parseInt(envStr("ICONS_DELAY_MS", "800"), 10);
  const only = parseOnlyFilter();
  const referralCode = process.env.NADO_APP_REFERRAL_CODE?.trim();

  mkdirSync(outDir, { recursive: true });

  const perps = await fetchPerps(gatewayV2);
  const filtered = only
    ? perps.filter((p) => only.has(p.marketKey.toUpperCase()))
    : perps;

  if (filtered.length === 0) {
    console.warn("No perp markets to process (check ICONS_ONLY or /v2/assets).");
    return;
  }

  const { browser, close } = await connectBrowser();
  const manifest: ManifestEntry[] = [];

  try {
    const page = await getOrCreatePage(browser);
    await ensureNadoAppAccess(page, referralCode);

    let btcRef: Buffer | null = null;
    const btcPath = join(outDir, "BTC.svg");
    if (existsSync(btcPath)) {
      btcRef = readFileSync(btcPath);
    }

    for (const row of filtered) {
      const caps: SvgCapture[] = [];
      const detach = await attachSvgCollector(page, (cap) => {
        caps.push(cap);
      });

      const targetUrl = `${NADO_APP}/perpetuals?market=${encodeURIComponent(row.marketKey)}`;
      let finalUrl = targetUrl;
      let status: ManifestEntry["status"] = "error";
      let message: string | undefined;
      let picked: SvgCapture | null = null;

      try {
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        const mkUpper = row.marketKey.toUpperCase();
        await page
          .waitForURL(
            (url) => {
              try {
                const m = new URL(url).searchParams.get("market")?.toUpperCase() ?? "";
                return m === mkUpper;
              } catch {
                return false;
              }
            },
            { timeout: 45_000 },
          )
          .catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
        await sleep(400);

        finalUrl = page.url();
        const u = new URL(finalUrl);
        const marketParam = u.searchParams.get("market")?.toUpperCase() ?? "";

        if (marketParam !== row.marketKey.toUpperCase()) {
          status = "skipped_not_on_app";
          message = `URL shows ?market=${marketParam || "none"} but Gateway slug is ${row.marketKey} (redirect to another asset, not necessarily BTC). No stable route for this perp on app.nado.xyz.`;
          manifest.push({
            marketKey: row.marketKey,
            product_id: row.product_id,
            symbol: row.symbol,
            status,
            finalUrl,
            message,
          });
          detach();
          continue;
        }

        if (await isChooseMarketSwitcher(page)) {
          status = "skipped_not_on_app";
          message =
            'Market switcher shows "Choose Market" — this perp is not listed on app.nado.xyz (Gateway /v2/assets may still expose it).';
          manifest.push({
            marketKey: row.marketKey,
            product_id: row.product_id,
            symbol: row.symbol,
            status,
            finalUrl,
            message,
          });
          detach();
          continue;
        }

        await page
          .locator('[data-testid="trading-market-switcher-trigger"] img')
          .first()
          .waitFor({ state: "visible", timeout: 25_000 })
          .catch(() => {});
        await page
          .waitForSelector('img[src*="/_next/static/media/"]', { timeout: 5_000 })
          .catch(() => {});
        await sleep(Number.isFinite(delayMs) ? delayMs : 800);

        picked = pickSvgForMarket(row.marketKey, caps);
        if (!picked) {
          picked = await pickSvgFromDom(page, row.marketKey);
        }
        if (!picked && process.env.ICONS_DEBUG === "1") {
          const domUrls = await collectMediaSvgUrls(page);
          console.error(
            `[debug] ${row.marketKey} caps=${caps.map((c) => c.url).join(" | ")}`,
          );
          console.error(`[debug] ${row.marketKey} dom=${domUrls.join(" | ")}`);
        }
        if (!picked) {
          status = "skipped_no_svg";
          message = `No matching perp icon for ${row.marketKey} (network: ${caps.length} svg responses).`;
          manifest.push({
            marketKey: row.marketKey,
            product_id: row.product_id,
            symbol: row.symbol,
            status,
            finalUrl,
            message,
          });
          detach();
          continue;
        }

        if (
          btcRef &&
          row.marketKey.toUpperCase() !== "BTC" &&
          picked.body.equals(btcRef)
        ) {
          status = "skipped_not_on_app";
          message =
            "Resolved icon bytes match BTC.svg (app likely fell back to BTC for this slug).";
          manifest.push({
            marketKey: row.marketKey,
            product_id: row.product_id,
            symbol: row.symbol,
            status,
            finalUrl,
            pickedUrl: picked.url,
            message,
          });
          detach();
          continue;
        }

        const sha256 = createHash("sha256").update(picked.body).digest("hex");
        const outPath = join(outDir, `${row.marketKey.toUpperCase()}.svg`);
        writeFileSync(outPath, picked.body);
        if (row.marketKey.toUpperCase() === "BTC" && !btcRef) {
          btcRef = picked.body;
        }

        status = "ok";
        manifest.push({
          marketKey: row.marketKey,
          product_id: row.product_id,
          symbol: row.symbol,
          status,
          finalUrl,
          pickedUrl: picked.url,
          sha256,
          bytes: picked.body.length,
        });
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
        manifest.push({
          marketKey: row.marketKey,
          product_id: row.product_id,
          symbol: row.symbol,
          status: "error",
          finalUrl,
          message,
        });
      } finally {
        detach();
      }
    }
  } finally {
    await close();
  }

  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        gateway: gatewayV2,
        entries: manifest,
      },
      null,
      2,
    ),
  );

  const ok = manifest.filter((m) => m.status === "ok").length;
  const notOnApp = manifest.filter((m) => m.status === "skipped_not_on_app").length;
  console.log(
    `Done. ${ok}/${manifest.length} ok, skipped_not_on_app=${notOnApp}. Manifest: ${manifestPath}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
