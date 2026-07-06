# Nado GitBook docs — local RAG pipeline

This repo ships a **local-only** sync + index pipeline for [docs.nado.xyz](https://docs.nado.xyz). Runtime API types for the app remain in `lib/schemas/nado.ts`; this pipeline is for **documentation retrieval** (agents, IDE, offline search).

## Commands (pnpm)

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm docs:sync:llms` | **Recommended.** Fetch all pages via `llms.txt` `.md` endpoints — no bot detection, 100% success rate |
| `pnpm docs:sync:nado` | Legacy HTML crawler — slower, rate-limited, ~50% fail rate on docs.nado.xyz |
| `pnpm docs:index:nado` | Chunk Markdown, embed with Ollama, store vectors in SQLite (`nado-rag/rag.sqlite`) |
| `pnpm docs:verify:nado` | Coverage report + **fails if any nav link is missing** from successful fetches |
| `pnpm docs:build:nado` | Legacy: `sync` → `index` → `verify` (uses HTML crawler) |
| `pnpm docs:query:nado "<text>"` | Semantic search over the local index |

### Recommended workflow

```bash
ollama serve                    # ensure Ollama is running (nomic-embed-text)
pnpm docs:sync:llms             # fetch 214 pages via .md endpoints (~25s)
pnpm docs:index:nado            # chunk + embed into SQLite (~2h first run)
pnpm docs:query:nado "cancel orders SDK"  # test
```

### Legacy HTML crawler

Use **`NADO_DOCS_RESUME=1`** to resume from `nado-rag/crawl-state.json` after an interruption. Optional env vars in `.env.example`.

## Outputs

All outputs land in `nado-rag/` which is fully gitignored — each developer runs the pipeline locally.

| Path | Description |
| --- | --- |
| `nado-rag/nado-manifest.json` | All URLs, fetch status, content hash, depth, parents, redirects, nav + sitemap lists |
| `nado-rag/pages-md/*.md` | Normalized Markdown with YAML frontmatter (`title`, `source_url`, `fetched_at`, `section_path`) |
| `nado-rag/pages-json/*.json` | Raw metadata per page (title, headings, links out) |
| `nado-rag/link-graph.json` | Adjacency list of internal links |
| `nado-rag/reports/nado-coverage-report.md` | Human-readable coverage / broken links |
| `nado-rag/rag.sqlite` | Chunk embeddings — regenerate with `pnpm docs:index:nado` |
| `nado-rag/crawl-state.json` | Transient resume state (`NADO_DOCS_RESUME=1`) |

## Querying the index (priority: local)

1. Ensure **Ollama** (or OpenAI-compatible API) is reachable with the same model as used for indexing.
2. From code, use:

- `searchDocs(query, topK, filters?)` in `lib/docs-rag/query.ts` — embeds the query then ranks chunks.
- Lower-level: `embedTexts` + `openRagDb` + `rankChunksByEmbedding` in `lib/docs-rag/search.ts` and `lib/docs-rag/embeddings.ts`.

3. Resolve a page record: `getPageByUrl(manifestPath, url)` in `lib/docs-rag/search.ts`.

4. Outgoing internal links: `getLinkedPages(manifest, url)`.

## Fallback when a page is missing locally

If `getPageByUrl` returns `null` or sync failed for a URL:

1. Re-run `pnpm docs:sync:nado` (check `NADO_DOCS_MAX_FAIL_RATIO` and network).
2. If the site structure changed, open the URL in the browser and compare with `navLinksExpected` / `sitemapUrls` in the manifest.
3. As a last resort, use the public site: `https://docs.nado.xyz/...` (respect `robots.txt` and rate limits; do not use blocked bot user-agents).

## Embeddings providers

- **Default:** `NADO_DOCS_EMBED_PROVIDER=ollama` and `OLLAMA_EMBED_MODEL` (e.g. `nomic-embed-text`). Index and query **must** use the same model/dimension.
- **Alternative:** `NADO_DOCS_EMBED_PROVIDER=openai` with `OPENAI_API_KEY` and `OPENAI_EMBED_MODEL`.

## Integration test (live network)

```bash
NADO_DOCS_INTEGRATION=1 pnpm test
```

## How `llms-sync` works

Nado docs (GitBook) expose an `llms.txt` file at `https://docs.nado.xyz/llms.txt` listing every page with a `.md` URL. The `llms-sync` script:

1. Fetches `llms.txt` to discover all 214+ page URLs
2. Downloads each page's `.md` endpoint (raw markdown, no HTML parsing)
3. Writes `pages-md/*.md` (with YAML frontmatter) + `pages-json/*.json` (metadata)
4. Writes `nado-manifest.json` in the format expected by `docs:index:nado`

Advantages over HTML crawler: no bot detection, no Cloudflare blocks, 100% success rate, ~25 seconds total.

## TODO / external blockers

- If `llms.txt` endpoint changes or is removed, fall back to `pnpm docs:sync:nado` (HTML crawler)
- **GitBook** HTML structure may change; content extraction uses `main` / `article` fallbacks — adjust selectors in `lib/docs-rag/htmlToMarkdown.ts` if needed.
