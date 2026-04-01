import fs from "node:fs/promises"
import path from "node:path"
import type { DocsRagConfig } from "./config"
import { chunkMarkdown } from "./chunker"
import { embedTexts } from "./embeddings"
import { stripFrontmatter } from "./frontmatter"
import { sha256Hex } from "./hash"
import { log } from "./logger"
import { readManifest } from "./manifestIO"
import { paths } from "./paths"
import {
  deleteChunksForPage,
  insertChunk,
  openRagDb,
} from "./ragDb"

const EMBED_BATCH = 12

export async function runDocsIndex(cfg: DocsRagConfig): Promise<void> {
  const manifest = await readManifest(paths.manifest)
  const { sqlite, close } = openRagDb(paths.sqlite)

  try {
    const okPages = manifest.pages.filter((p) => p.status === "ok")
    for (const page of okPages) {
      const mdName = `${sha256Hex(page.url).slice(0, 24)}.md`
      const mdPath = path.join(paths.pagesMdDir, mdName)
      let raw: string
      try {
        raw = await fs.readFile(mdPath, "utf8")
      } catch {
        log("warn", "missing_md_skip", { url: page.url, mdPath })
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
        log("debug", "index_skip_unchanged", { url: page.url })
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

      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const slice = chunks.slice(i, i + EMBED_BATCH)
        const vectors = await embedTexts(
          slice.map((c) => c.text),
          cfg,
        )
        for (let j = 0; j < slice.length; j++) {
          insertChunk(sqlite, slice[j], vectors[j], pageContentHash)
        }
      }

      log("info", "page_indexed", {
        url: page.url,
        chunks: chunks.length,
      })
    }
  } finally {
    close()
  }
}
