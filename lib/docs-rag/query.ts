import { loadDocsRagConfig, type DocsRagConfig } from "./config"
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
 * Pass `cfg` explicitly (e.g. from the CLI with nadoDocsDefaults) so the
 * committed config file is honoured instead of falling back to Zod defaults only.
 */
export async function searchDocs(
  query: string,
  topK: number,
  filters: SearchFilters = {},
  cfg?: DocsRagConfig,
): Promise<SearchHit[]> {
  const config = cfg ?? loadDocsRagConfig()
  const [vec] = await embedTexts([query], config)
  const { sqlite, close } = openRagDb(paths.sqlite)
  try {
    return await rankChunksByEmbedding(sqlite, vec, topK, filters)
  } finally {
    close()
  }
}
