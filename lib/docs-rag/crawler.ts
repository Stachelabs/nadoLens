import fs from "node:fs/promises"
import path from "node:path"
import type { DocsRagConfig } from "./config"
import { dedupeUrls } from "./dedup"
import {
  extractAnchorsFromHtml,
  extractInternalLinkUrls,
  extractNavLinkUrls,
} from "./extractLinks"
import { fetchWithRetry } from "./fetchWithRetry"
import { sha256Hex } from "./hash"
import {
  extractHeadings,
  extractMainContentHtml,
  extractTitle,
  htmlFragmentToMarkdown,
} from "./htmlToMarkdown"
import { clearProgress, log, logProgress } from "./logger"
import { paths } from "./paths"
import { isUrlAllowedByRobots, parseRobotsTxt } from "./robots"
import { fetchAllSitemapPageUrls } from "./sitemap"
import type { CrawlQueueItem, Manifest, PageRecord } from "./types"
import { normalizeInternalUrl } from "./urlNormalize"

const FETCH_UA = "NadoLensDocsBot/1.0 (+local-rag)"

function buildFrontmatter(opts: {
  title: string
  sourceUrl: string
  fetchedAt: string
  sectionPath: string
}): string {
  return [
    "---",
    `title: ${JSON.stringify(opts.title)}`,
    `source_url: ${JSON.stringify(opts.sourceUrl)}`,
    `fetched_at: ${JSON.stringify(opts.fetchedAt)}`,
    `section_path: ${JSON.stringify(opts.sectionPath)}`,
    "---",
    "",
  ].join("\n")
}

function sectionPathFromUrl(baseUrl: string, pageUrl: string): string {
  const u = new URL(pageUrl)
  const p = u.pathname.replace(/^\/+|\/+$/g, "")
  if (!p) return "/"
  return p
    .split("/")
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ")
}

function recordStatus(httpStatus: number): PageRecord["status"] {
  return httpStatus >= 200 && httpStatus < 400 ? "ok" : "failed"
}

export async function runDocsSync(cfg: DocsRagConfig): Promise<Manifest> {
  const syncStart = Date.now()
  const baseOrigin = cfg.baseUrl
  const fetchOpts = {
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
    userAgent: FETCH_UA,
  }

  await fs.mkdir(paths.pagesJsonDir, { recursive: true })
  await fs.mkdir(paths.pagesMdDir, { recursive: true })
  await fs.mkdir(path.dirname(paths.report), { recursive: true })
  await fs.mkdir(path.dirname(paths.crawlState), { recursive: true })

  const robotsRes = await fetchWithRetry(`${baseOrigin}/robots.txt`, fetchOpts)
  const robotsTxt = robotsRes.ok ? await robotsRes.text() : ""
  const robotsRules = parseRobotsTxt(robotsTxt)

  log("info", "robots_loaded", { bytes: robotsTxt.length })

  const sitemapUrls = dedupeUrls(
    await fetchAllSitemapPageUrls(baseOrigin, baseOrigin, fetchOpts),
  )

  const canonicalBase =
    normalizeInternalUrl(baseOrigin, `${baseOrigin}/`, baseOrigin) ?? baseOrigin

  const queue: CrawlQueueItem[] = []
  const seen = new Set<string>()

  let resumed = false
  if (cfg.resume) {
    try {
      const raw = await fs.readFile(paths.crawlState, "utf8")
      const j = JSON.parse(raw) as {
        queue?: CrawlQueueItem[]
        seen?: string[]
      }
      if (j.queue && j.queue.length > 0 && j.seen && j.seen.length > 0) {
        queue.push(...j.queue)
        for (const s of j.seen) seen.add(s)
        resumed = true
        log("info", "crawl_resume_loaded", {
          queue: queue.length,
          seen: seen.size,
        })
      }
    } catch {
      /* no prior state */
    }
  }

  const enqueue = (rawUrl: string, depth: number, parent: string | null) => {
    const normalized =
      normalizeInternalUrl(baseOrigin, rawUrl, canonicalBase) ??
      normalizeInternalUrl(baseOrigin, rawUrl, `${canonicalBase}/`)
    if (!normalized) return
    if (depth > cfg.maxDepth) return
    if (seen.has(normalized)) return
    const allow = isUrlAllowedByRobots(normalized, robotsRules)
    if (!allow.allowed) {
      log("debug", "skip_robots", { url: normalized, reason: allow.reason })
      return
    }
    seen.add(normalized)
    queue.push({ url: normalized, depth, parent })
  }

  if (!resumed) {
    enqueue(canonicalBase, 0, null)
    for (const u of sitemapUrls) {
      enqueue(u, 0, null)
    }
  }

  let navLinksExpected: string[] = []
  const parents = new Map<string, Set<string>>()
  const linksGraph: Record<string, string[]> = {}
  const redirectMap: Record<string, string> = {}
  const pages: PageRecord[] = []

  const addParent = (child: string, parent: string | null) => {
    if (!parent) return
    let set = parents.get(child)
    if (!set) {
      set = new Set()
      parents.set(child, set)
    }
    set.add(parent)
  }

  const mergeEdge = (from: string, to: string) => {
    const cur = linksGraph[from] ?? []
    if (!cur.includes(to)) cur.push(to)
    linksGraph[from] = cur
  }

  const processOne = async (item: CrawlQueueItem): Promise<void> => {
    const { url: requestedUrl, depth, parent } = item
    addParent(requestedUrl, parent)

    if (!linksGraph[requestedUrl]) linksGraph[requestedUrl] = []

    try {
      const res = await fetchWithRetry(requestedUrl, fetchOpts)
      const resolvedFinal = new URL(res.url)
      const finalUrl =
        normalizeInternalUrl(
          baseOrigin,
          resolvedFinal.href,
          requestedUrl,
        ) ?? requestedUrl

      if (finalUrl !== requestedUrl) {
        redirectMap[requestedUrl] = finalUrl
        addParent(finalUrl, parent)
      }

      if (!res.ok) {
        pages.push({
          url: finalUrl,
          status: "failed",
          httpStatus: res.status,
          depth,
          parents: Array.from(parents.get(finalUrl) ?? []),
          error: `http_${res.status}`,
        })
        return
      }

      const contentType = res.headers.get("content-type") ?? ""
      if (!contentType.includes("text/html")) {
        pages.push({
          url: finalUrl,
          status: "failed",
          httpStatus: res.status,
          depth,
          parents: Array.from(parents.get(requestedUrl) ?? []),
          error: `non_html:${contentType}`,
        })
        return
      }

      const html = await res.text()
      const htmlHash = sha256Hex(html)

      if (navLinksExpected.length === 0) {
        navLinksExpected = dedupeUrls(
          extractNavLinkUrls(html, finalUrl, baseOrigin),
        )
      }

      const title = extractTitle(html)
      const headings = extractHeadings(html)
      const anchors = extractAnchorsFromHtml(html, finalUrl, baseOrigin)
      const internalHrefs = extractInternalLinkUrls(html, finalUrl, baseOrigin)

      for (const h of internalHrefs) {
        mergeEdge(finalUrl, h)
        enqueue(h, depth + 1, finalUrl)
      }

      const mainHtml = extractMainContentHtml(html)
      const mdBody = htmlFragmentToMarkdown(mainHtml)
      const fetchedAt = new Date().toISOString()
      const section = sectionPathFromUrl(baseOrigin, finalUrl)
      const md = `${buildFrontmatter({
        title,
        sourceUrl: finalUrl,
        fetchedAt,
        sectionPath: section,
      })}${mdBody}\n`

      const jsonName = `${sha256Hex(finalUrl).slice(0, 24)}.json`
      const pageJson = {
        url: finalUrl,
        title,
        contentHash: htmlHash,
        headings,
        linksOut: anchors,
        lastModified: res.headers.get("last-modified") ?? undefined,
        httpStatus: res.status,
      }
      await fs.writeFile(
        path.join(paths.pagesJsonDir, jsonName),
        JSON.stringify(pageJson, null, 2),
        "utf8",
      )

      const mdName = `${sha256Hex(finalUrl).slice(0, 24)}.md`
      await fs.writeFile(path.join(paths.pagesMdDir, mdName), md, "utf8")

      const st = recordStatus(res.status)
      pages.push({
        url: finalUrl,
        status: st,
        httpStatus: res.status,
        contentHash: htmlHash,
        depth,
        parents: Array.from(parents.get(finalUrl) ?? []),
        fetchedAt,
        finalUrl: finalUrl !== requestedUrl ? finalUrl : undefined,
        redirectedFrom: finalUrl !== requestedUrl ? requestedUrl : undefined,
        title,
        lastModified: pageJson.lastModified,
        headings,
        linksOut: anchors,
      })
      log("debug", "page_ok", {
        url: new URL(finalUrl).pathname,
        status: res.status,
        links: internalHrefs.length,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log("error", "page_fetch_failed", { url: requestedUrl, err: msg })
      pages.push({
        url: requestedUrl,
        status: "failed",
        depth,
        parents: Array.from(parents.get(requestedUrl) ?? []),
        error: msg,
      })
    }
  }

  let processed = 0
  let failed = 0
  const batchStart = Date.now()

  while (queue.length > 0) {
    if (cfg.dryRun && processed >= cfg.dryRunMaxPages) {
      log("warn", "dry_run_cap", { processed, cap: cfg.dryRunMaxPages })
      break
    }
    const batch = queue.splice(0, Math.min(cfg.concurrency, queue.length))
    const currentUrl = new URL(batch[0].url).pathname
    const estimated = processed + queue.length + batch.length
    const elapsed = (Date.now() - batchStart) / 1000
    const pps = elapsed > 0 ? (processed / elapsed).toFixed(1) : "—"
    failed = pages.filter((p) => p.status === "failed").length
    logProgress(processed, estimated, `${pps}p/s · fail:${failed} · ${currentUrl}`)

    await Promise.all(batch.map((b) => processOne(b)))
    processed += batch.length

    if (processed % 20 === 0) {
      await persistState()
    }
  }
  clearProgress()

  async function persistState(): Promise<void> {
    const state = {
      version: 1 as const,
      baseOrigin,
      queue,
      seen: [...seen],
      updatedAt: new Date().toISOString(),
    }
    await fs.writeFile(paths.crawlState, JSON.stringify(state, null, 2), "utf8")
  }

  await persistState()

  const manifestPages = dedupePagesByUrl(pages)
  const totalOk = manifestPages.filter((p) => p.status === "ok").length
  const totalFailed = manifestPages.filter((p) => p.status === "failed").length
  const totalDiscovered = manifestPages.length

  await fs.writeFile(
    paths.linkGraph,
    JSON.stringify(linksGraph, null, 2),
    "utf8",
  )

  const manifest: Manifest = {
    baseUrl: baseOrigin,
    syncedAt: new Date().toISOString(),
    totalDiscovered,
    totalOk,
    totalFailed,
    pages: manifestPages,
    linksGraph,
    redirectMap,
    navLinksExpected,
    sitemapUrls,
    options: {
      concurrency: cfg.concurrency,
      maxRetries: cfg.maxRetries,
      timeoutMs: cfg.timeoutMs,
      dryRun: cfg.dryRun,
    },
  }

  await fs.writeFile(
    paths.manifest,
    JSON.stringify(manifest, null, 2),
    "utf8",
  )

  const failRatio = totalDiscovered > 0 ? totalFailed / totalDiscovered : 0
  const duration = ((Date.now() - syncStart) / 1000).toFixed(1)

  log("success", "sync_complete", {
    ok: totalOk,
    failed: totalFailed,
    total: totalDiscovered,
    fail_ratio: failRatio.toFixed(4),
    duration_s: duration,
    dry_run: cfg.dryRun || undefined,
  })

  if (failRatio > cfg.maxFailRatio) {
    throw new Error(
      `docs sync failed: fail ratio ${failRatio.toFixed(4)} > max ${cfg.maxFailRatio} (${totalFailed}/${totalDiscovered})`,
    )
  }

  return manifest
}

function dedupePagesByUrl(pages: PageRecord[]): PageRecord[] {
  const byUrl = new Map<string, PageRecord>()
  for (const p of pages) {
    if (!byUrl.has(p.url)) byUrl.set(p.url, p)
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url))
}
