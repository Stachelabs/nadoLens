/**
 * Sync Nado docs using llms.txt .md endpoints instead of HTML scraping.
 * Much more reliable — no bot detection, raw markdown served directly.
 *
 * Usage: pnpm exec tsx scripts/docs-rag/llms-sync.ts
 */
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

const BASE_URL = "https://docs.nado.xyz"
const LLMS_TXT_URL = `${BASE_URL}/llms.txt`
const PAGES_MD_DIR = path.resolve("nado-rag/pages-md")
const PAGES_JSON_DIR = path.resolve("nado-rag/pages-json")
const MANIFEST_PATH = path.resolve("nado-rag/nado-manifest.json")
const CONCURRENCY = 3
const DELAY_MS = 300

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex")
}

function pageId(url: string): string {
  return sha256(url).slice(0, 24)
}

function sectionPath(url: string): string {
  const u = new URL(url)
  const p = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\.md$/, "")
  if (!p) return "/"
  return "/" + p
}

type PageEntry = { url: string; title: string; mdUrl: string }

async function parseLlmsTxt(): Promise<PageEntry[]> {
  console.log(`Fetching ${LLMS_TXT_URL}...`)
  const res = await fetch(LLMS_TXT_URL, {
    headers: { "Accept-Encoding": "gzip, deflate, br" },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`llms.txt fetch failed: ${res.status}`)
  const text = await res.text()

  const entries: PageEntry[] = []
  const re = /\[([^\]]*)\]\((https:\/\/docs\.nado\.xyz\/[^)]+\.md)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const title = match[1] || "Untitled"
    const mdUrl = match[2]
    const pageUrl = mdUrl.replace(/\.md$/, "")
    entries.push({ url: pageUrl, title, mdUrl })
  }
  console.log(`Found ${entries.length} pages in llms.txt`)
  return entries
}

async function fetchPage(entry: PageEntry): Promise<{
  markdown: string
  status: number
} | null> {
  try {
    const res = await fetch(entry.mdUrl, {
      headers: {
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": "NadoLensDocsBot/1.0 (+local-rag)",
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      console.warn(`  FAIL ${res.status} ${entry.mdUrl}`)
      return { markdown: "", status: res.status }
    }
    const markdown = await res.text()
    return { markdown, status: res.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`  ERR ${entry.mdUrl}: ${msg}`)
    return null
  }
}

function extractHeadings(md: string): string[] {
  const headings: string[] = []
  for (const line of md.split("\n")) {
    const m = line.match(/^#{1,4}\s+(.+)/)
    if (m) headings.push(m[1].replace(/<[^>]+>/g, "").trim())
  }
  return headings
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const entries = await parseLlmsTxt()

  await fs.mkdir(PAGES_MD_DIR, { recursive: true })
  await fs.mkdir(PAGES_JSON_DIR, { recursive: true })

  type PageRecord = {
    url: string
    status: "ok" | "failed"
    httpStatus?: number
    contentHash?: string
    depth: number
    parents: string[]
    fetchedAt?: string
    title?: string
    headings?: string[]
    linksOut?: { href: string; text?: string }[]
  }

  const pages: PageRecord[] = []

  let ok = 0
  let failed = 0

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (entry) => {
        const result = await fetchPage(entry)
        return { entry, result }
      }),
    )

    for (const { entry, result } of results) {
      const id = pageId(entry.url)
      const section = sectionPath(entry.url)
      const now = new Date().toISOString()

      if (!result || !result.markdown) {
        failed++
        pages.push({
          url: entry.url,
          status: "failed",
          httpStatus: result?.status,
          depth: 0,
          parents: [],
          fetchedAt: now,
          title: entry.title,
        })
        continue
      }

      // Strip the llms.txt header line that starts with "> For the complete..."
      const markdown = result.markdown.replace(
        /^> For the complete documentation index.*\n\n?/,
        "",
      )

      const contentHash = sha256(markdown)
      const headings = extractHeadings(markdown)

      // Write frontmatter + markdown
      const frontmatter = [
        "---",
        `title: ${JSON.stringify(entry.title)}`,
        `source_url: ${JSON.stringify(entry.url)}`,
        `fetched_at: ${JSON.stringify(now)}`,
        `section_path: ${JSON.stringify(section)}`,
        "---",
        "",
      ].join("\n")
      await fs.writeFile(
        path.join(PAGES_MD_DIR, `${id}.md`),
        frontmatter + markdown,
      )

      // Write JSON metadata
      const jsonRecord = {
        url: entry.url,
        title: entry.title,
        contentHash,
        headings,
        linksOut: [],
        httpStatus: result.status,
        markdown,
      }
      await fs.writeFile(
        path.join(PAGES_JSON_DIR, `${id}.json`),
        JSON.stringify(jsonRecord, null, 2),
      )

      pages.push({
        url: entry.url,
        status: "ok",
        httpStatus: result.status,
        contentHash,
        depth: 0,
        parents: [],
        fetchedAt: now,
        title: entry.title,
        headings,
      })
      ok++
    }

    const total = Math.min(i + CONCURRENCY, entries.length)
    process.stdout.write(`\r  Synced ${total}/${entries.length} (${ok} ok, ${failed} failed)`)

    if (i + CONCURRENCY < entries.length) await sleep(DELAY_MS)
  }

  console.log("")

  const allUrls = entries.map((e) => e.url)
  const manifest = {
    baseUrl: BASE_URL,
    syncedAt: new Date().toISOString(),
    totalDiscovered: entries.length,
    totalOk: ok,
    totalFailed: failed,
    pages,
    linksGraph: {} as Record<string, string[]>,
    redirectMap: {} as Record<string, string>,
    navLinksExpected: allUrls,
    sitemapUrls: allUrls,
  }
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  console.log(`\nSync complete: ${ok} ok, ${failed} failed out of ${entries.length}`)
  console.log(`Next: pnpm docs:index:nado`)

  if (failed / entries.length > 0.1) {
    console.warn(`Warning: ${((failed / entries.length) * 100).toFixed(1)}% pages failed`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
