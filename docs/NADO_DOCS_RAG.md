# Nado GitBook docs — local RAG pipeline

This repo ships a **local-only** sync + index pipeline for [docs.nado.xyz](https://docs.nado.xyz). Runtime API types for the app remain in `lib/schemas/nado.ts`; this pipeline is for **documentation retrieval** (agents, IDE, offline search).

## Commands (pnpm)

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm docs:sync:nado` | Crawl, normalize to Markdown + JSON, write `nado-manifest.json` + link graph |
| `pnpm docs:index:nado` | Chunk Markdown, embed, store vectors in SQLite (`nado-rag/rag.sqlite`) |
| `pnpm docs:verify:nado` | Coverage report + **fails if any nav link is missing** from successful fetches |
| `pnpm docs:build:nado` | `sync` → `index` → `verify` |

Use **`NADO_DOCS_RESUME=1`** to resume from `nado-rag/crawl-state.json` after an interruption (restores `queue` + `seen`; does not re-seed from sitemap).

Optional env vars are documented in `.env.example`. With Node 20+, you can load a file without extra deps:

```bash
node --env-file=.env.local pnpm docs:sync:nado
```

(or export variables in your shell before `pnpm`.)

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

## TODO / external blockers

- If **Cloudflare** or rate limits block the crawler, lower `NADO_DOCS_CONCURRENCY`, increase `NADO_DOCS_TIMEOUT_MS`, or retry later.
- If **sitemap** returns 5xx, the crawler still uses **BFS from the home page + in-page links**; the manifest records `sitemapUrls` separately.
- **GitBook** HTML structure may change; content extraction uses `main` / `article` fallbacks — adjust selectors in `lib/docs-rag/htmlToMarkdown.ts` if needed.
