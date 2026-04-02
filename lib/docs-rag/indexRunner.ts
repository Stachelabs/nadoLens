import fs from "node:fs/promises"
import path from "node:path"
import type { DocsRagConfig } from "./config"
import { chunkMarkdown } from "./chunker"
import { embedTexts } from "./embeddings"
import { stripFrontmatter } from "./frontmatter"
import { sha256Hex } from "./hash"
import { clearProgress, log, logProgress } from "./logger"
import { readManifest } from "./manifestIO"
import { paths } from "./paths"
import {
  deleteChunksForPage,
  insertChunk,
  openRagDb,
} from "./ragDb"

export async function runDocsIndex(cfg: DocsRagConfig): Promise<void> {
  const startTime = Date.now()
  const manifest = await readManifest(paths.manifest)
  const { sqlite, close } = openRagDb(paths.sqlite)
  const embedBatch = cfg.embedBatchSize

  const model =
    cfg.embedProvider === "ollama" ? cfg.ollamaEmbedModel : cfg.openaiEmbedModel

  log("info", "index_start", {
    pages: manifest.pages.filter((p) => p.status === "ok").length,
    provider: cfg.embedProvider,
    model,
    batch_size: embedBatch,
  })

  let indexed = 0
  let skipped = 0
  let totalChunks = 0

  try {
    const okPages = manifest.pages.filter((p) => p.status === "ok")

    for (let pageIdx = 0; pageIdx < okPages.length; pageIdx++) {
      const page = okPages[pageIdx]
      const mdName = `${sha256Hex(page.url).slice(0, 24)}.md`
      const mdPath = path.join(paths.pagesMdDir, mdName)
      let raw: string
      try {
        raw = await fs.readFile(mdPath, "utf8")
      } catch {
        log("warn", "missing_md_skip", { url: page.url })
        continue
      }

      const body = stripFrontmatter(raw)
      const pageContentHash = page.contentHash ?? sha256Hex(body)

      const existing = sqlite
        .prepare(
          "SELECT COUNT(*) as c FROM chunks WHERE page_url = ? AND page_content_hash = ?",
        )
        .get(page.url, pageContentHash) as { c: number }

      if (existing.c > 0) {
        skipped++
        logProgress(
          pageIdx + 1,
          okPages.length,
          `skip (unchanged) · ${new URL(page.url).pathname}`,
        )
        continue
      }

      deleteChunksForPage(sqlite, page.url)

      const section =
        page.title?.replace(/\s+/g, " ").trim() ||
        new URL(page.url).pathname ||
        "/"
      const chunks = chunkMarkdown(page.url, body, section, {
        maxChars: cfg.chunkMaxChars,
      })

      for (let i = 0; i < chunks.length; i += embedBatch) {
        const slice = chunks.slice(i, i + embedBatch)
        const chunkLabel = `chunk ${i + 1}-${Math.min(i + embedBatch, chunks.length)}/${chunks.length} · ${new URL(page.url).pathname}`
        logProgress(pageIdx + 1, okPages.length, chunkLabel)

        const vectors = await embedTexts(
          slice.map((c) => c.text),
          cfg,
        )
        for (let j = 0; j < slice.length; j++) {
          insertChunk(sqlite, slice[j], vectors[j], pageContentHash)
        }
      }

      indexed++
      totalChunks += chunks.length
      log("debug", "page_indexed", {
        url: new URL(page.url).pathname,
        chunks: chunks.length,
      })
    }
  } finally {
    clearProgress()
    close()
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  log("success", "index_complete", {
    pages_indexed: indexed,
    pages_skipped: skipped,
    chunks_total: totalChunks,
    model,
    duration_s: duration,
  })
}
