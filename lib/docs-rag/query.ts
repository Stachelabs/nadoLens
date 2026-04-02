import { loadDocsRagConfig } from "./config"
import { embedTexts } from "./embeddings"
import { paths } from "./paths"
import { openRagDb } from "./ragDb"
import {
  rankChunksByEmbedding,
  type SearchFilters,
  type SearchHit,
} from "./search"

/**
 * Semantic search over the local SQLite index: embeds `query`, then ranks chunks.
 * Matches the requested API shape `searchDocs(query, topK, filters)`.
 */
export async function searchDocs(
  query: string,
  topK: number,
  filters: SearchFilters = {},
): Promise<SearchHit[]> {
  const cfg = loadDocsRagConfig()
  const [vec] = await embedTexts([query], cfg)
  const { sqlite, close } = openRagDb(paths.sqlite)
  try {
    return await rankChunksByEmbedding(sqlite, vec, topK, filters)
  } finally {
    close()
  }
}
