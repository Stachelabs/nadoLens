import Database from "better-sqlite3"
import { loadAllChunksForSearch } from "./ragDb"
import { readManifest } from "./manifestIO"
import type { Manifest } from "./types"

type SqliteDb = InstanceType<typeof Database>

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export type SearchHit = {
  id: string
  pageUrl: string
  text: string
  score: number
}

export type SearchFilters = {
  /** Match if page URL path starts with this prefix (e.g. `/developer-resources`). */
  pathPrefix?: string
}

/** Rank stored chunks by cosine similarity to a query embedding. */
export async function rankChunksByEmbedding(
  db: SqliteDb,
  queryEmbedding: number[],
  topK: number,
  filters: SearchFilters = {},
): Promise<SearchHit[]> {
  const rows = loadAllChunksForSearch(db)
  const scored: SearchHit[] = []
  for (const row of rows) {
    if (filters.pathPrefix) {
      try {
        const p = new URL(row.pageUrl).pathname
        if (!p.startsWith(filters.pathPrefix)) continue
      } catch {
        continue
      }
    }
    const score = cosineSimilarity(queryEmbedding, row.embedding)
    scored.push({
      id: row.id,
      pageUrl: row.pageUrl,
      text: row.text,
      score,
    })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export async function getPageByUrl(
  manifestPath: string,
  url: string,
): Promise<Manifest["pages"][number] | null> {
  const m = await readManifest(manifestPath)
  const hit = m.pages.find((p) => p.url === url)
  return hit ?? null
}

export function getLinkedPages(
  manifest: Manifest,
  url: string,
): string[] {
  return manifest.linksGraph[url] ?? []
}
