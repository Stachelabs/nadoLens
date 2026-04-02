# NadoLens

On-chain analytics tool for the **[Nado](https://nado.xyz)** protocol — a CLOB DEX deployed on Ink L2.

Work in progress. Currently implemented: wallet explorer (`/wallet/[address]`) with live open positions.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 — App Router + Turbopack |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Client state | Zustand 5 |
| Wallet / Blockchain | wagmi 2 · viem 2 · RainbowKit 2 |
| Trading charts | TradingView Lightweight Charts v5 |
| Stats charts | Recharts |
| Validation | Zod 4 |
| Database | Prisma 5 + Neon (serverless PostgreSQL) |
| WS Proxy | Bun (Railway — eu-west4) |

---

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10 (`npm i -g pnpm`)
- **Ollama** *(optional — for the docs RAG pipeline)* — [install](https://ollama.com/download), then `ollama pull nomic-embed-text`. Must be running in the background (`ollama serve`) when using any `docs:*` command.

---

## Installation

```bash
pnpm install
cp .env.example .env
# Fill in DATABASE_URL, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, WS_PROXY_URL
```

---

## Environment variables

Copy `.env.example` → `.env`:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | ✅ | WalletConnect Cloud project ID |
| `WS_PROXY_URL` + `NEXT_PUBLIC_WS_PROXY_URL` | ✅ | Public URL of the Railway WS Proxy |
| `NADO_GATEWAY_REST` | ✅ | `https://gateway.prod.nado.xyz/v1` |
| `NADO_ARCHIVE_REST` | ✅ | `https://archive.prod.nado.xyz/v1` |
| `OPENAI_API_KEY` | ✗ | Only if `NADO_DOCS_EMBED_PROVIDER=openai` in the RAG config |

> Non-secret RAG config (URLs, concurrency, embedding models) lives in [`scripts/docs-rag/nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts) — no environment variables needed for those values.

---

## Available scripts

### App

| Command | Description |
|---|---|
| `pnpm dev` | Development server at `http://localhost:3000` (Turbopack) |
| `pnpm build` | Generate Prisma client then compile Next.js for production |
| `pnpm start` | Start Next.js in production mode (requires `pnpm build` first) |
| `pnpm lint` | ESLint across the whole project |

### Tests

| Command | Description |
|---|---|
| `pnpm test` | Run Vitest once (CI mode) |
| `pnpm test:watch` | Run Vitest in watch mode (development) |

---

### Docs RAG pipeline

The RAG pipeline lets you query the Nado documentation in **natural language** from the terminal or from Claude Code, without opening a browser.

It crawls `docs.nado.xyz`, splits pages into markdown chunks, encodes them as vectors via Ollama or OpenAI, and stores everything in a local SQLite under `.claude/docs/rag/`.

**Ollama prerequisite** (default provider) — required for both `docs:index:nado` and `docs:query:nado` (both embed text). `docs:sync:nado` and `docs:verify:nado` do not need it.

```bash
ollama serve                   # start once, stays in background
ollama pull nomic-embed-text   # one-time download
```

To use OpenAI instead: set `NADO_DOCS_EMBED_PROVIDER` in [`scripts/docs-rag/nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts) and add `OPENAI_API_KEY` to `.env`.

---

#### `pnpm docs:sync:nado` — Crawl

Crawls `https://docs.nado.xyz` from the sitemap and internal links, respects `robots.txt`, converts each HTML page to clean markdown.

**Generated artifacts:**

| Path | Content |
|---|---|
| `.claude/docs/rag/pages-md/` | Pages as Markdown (one file per page) |
| `.claude/docs/rag/pages-json/` | Page metadata (title, headings, outbound links, HTTP status) |
| `.claude/docs/nado-manifest.json` | Full crawl manifest (pages, link graph, redirects, sitemap URLs) |
| `.claude/docs/rag/crawl-state.json` | Resume state (used with `NADO_DOCS_RESUME=1`) |

**Main options** (edit in [`nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts)):

| Option | Default | Description |
|---|---|---|
| `NADO_DOCS_CONCURRENCY` | `2` | Pages crawled in parallel |
| `NADO_DOCS_MAX_DEPTH` | `32` | Maximum crawl depth |
| `NADO_DOCS_MAX_RETRIES` | `4` | Retries per page on network error |
| `NADO_DOCS_TIMEOUT_MS` | `45000` | HTTP timeout per request (ms) |
| `NADO_DOCS_MAX_FAIL_RATIO` | `0.08` | Max failure ratio before fatal error (8%) |

**One-off overrides** — passed as shell prefixes, no need to add them to `.env`:

```bash
NADO_DOCS_DRY_RUN=1 pnpm docs:sync:nado       # limit to 5 pages — quick test
NADO_DOCS_RESUME=1 pnpm docs:sync:nado         # resume from crawl-state.json
NADO_DOCS_LOG_LEVEL=debug pnpm docs:sync:nado  # verbose logs
```

---

#### `pnpm docs:index:nado` — Index

Reads the manifest, chunks each markdown page into sections (~2,200 chars), calls the embedding model in batches, and stores Float32 vectors in SQLite.

**Generated artifact:**

| Path | Content |
|---|---|
| `.claude/docs/rag/rag.sqlite` | Vector store (`chunks` table: text + embedding + hash) |

**Incremental indexing:** a page already indexed with the same `contentHash` is automatically skipped — re-running after a sync is always fast.

> ⚠️ Switching embedding providers (Ollama ↔ OpenAI) produces incompatible vector dimensions (768 vs 1,536). Any query attempt with mismatched dimensions throws an explicit error. Re-run `pnpm docs:index:nado` to rebuild from scratch.

**Options** — defaults in [`nado-docs.config.ts`](scripts/docs-rag/nado-docs.config.ts), overridable as shell prefixes:

| Option | Default | Description |
|---|---|---|
| `NADO_DOCS_EMBED_PROVIDER` | `ollama` | `ollama` or `openai` |
| `NADO_DOCS_EMBED_BATCH_SIZE` | `12` | Texts sent per batch to the embedder |
| `NADO_DOCS_CHUNK_MAX_CHARS` | `2200` | Character budget per chunk |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Local Ollama URL |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama model |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | OpenAI model |

---

#### `pnpm docs:verify:nado` — Verify coverage

Checks that all navigation URLs are present in the manifest and detects broken internal links.

**Generated artifact:**

| Path | Content |
|---|---|
| `.claude/docs/reports/nado-coverage-report.md` | Coverage report (missing nav pages + broken links) |

Exit code `1` if any navigation pages are missing from the index.

---

#### `pnpm docs:build:nado` — Full pipeline

Runs all three steps in one command: **sync → index → verify**.

```bash
pnpm docs:build:nado
```

Re-run after any significant update to the Nado documentation, or on first setup.

---

#### Reset the index from scratch

Do this when switching embedding providers (Ollama ↔ OpenAI), after a major restructuring of the Nado docs, or if the index seems corrupted.

```bash
# Delete all generated artifacts
rm -rf .claude/docs/rag/               # SQLite, pages-md/, pages-json/, crawl-state
rm -f .claude/docs/nado-manifest.json  # Crawl manifest
rm -rf .claude/docs/reports/           # Coverage reports

# Rebuild from scratch
pnpm docs:build:nado
```

> The `.md` files in `.claude/docs/` (`NADO_ARCHIVE_API.md`, `NADO_GATEWAY_API.md`, etc.) are **manually maintained** docs — do not delete them.

---

#### `pnpm docs:query:nado "<question>"` — Semantic search

Queries the local index in natural language. Embeds the question, computes cosine similarity against all chunks, and returns the top-K results with scores and text excerpts.

```bash
# Basic search
pnpm docs:query:nado "fee calculation matches archive"

# Limit number of results
pnpm docs:query:nado "pagination idx" --top-k 3

# Filter by API section
pnpm docs:query:nado "rate limits" --filter /developer-resources/api
```

**Options:**

| Option | Default | Description |
|---|---|---|
| `--top-k N` | `5` | Number of results to return |
| `--filter <path>` | — | Filter by URL path prefix (e.g. `/developer-resources/api`) |

**Example output:**

```
Query  "fee calculation matches archive"

  #1  score: 0.871  /developer-resources/api/archive-indexer/matches
      "fee: The amount of trading fees + sequencer fees paid on this match..."

  #2  score: 0.834  /developer-resources/concepts/fees
      "The fee field already includes sequencer fees. Do not sum fee + sequencer_fee..."

  #3  score: 0.801  /developer-resources/api/archive-indexer/matches
      "sequencer_fee: Breakdown of the sequencer portion only — already included in fee..."
```

---

#### Claude Code integration

Claude Code reads `CLAUDE.md` at the start of every conversation. `CLAUDE.md` references `pnpm docs:query:nado` under `## Nado API Documentation`, so Claude can query the RAG **directly from the chat** without copy-pasting docs.

**Workflow:**
1. Make sure the index is up to date: `pnpm docs:build:nado`
2. Open a Claude Code session in this repo
3. Ask your question — Claude will run `pnpm docs:query:nado` when needed

**Useful example queries:**

```bash
pnpm docs:query:nado "how does pagination work with submission_idx"
pnpm docs:query:nado "fee calculation matches archive sequencer"
pnpm docs:query:nado "subaccount bytes32 format default isolated"
pnpm docs:query:nado "rate limits weight per endpoint"
pnpm docs:query:nado "429 handling backoff retry"
pnpm docs:query:nado "x18 format bigint conversion"
pnpm docs:query:nado "realized pnl closed_amount settlement"
```

> Rebuild the index (`pnpm docs:build:nado`) after any major Nado docs update to keep answers accurate.

---

#### Log levels

All `docs:*` commands respect `NADO_DOCS_LOG_LEVEL`:

| Value | Usage |
|---|---|
| `debug` | Full details (skipped pages, per-batch timings, dedup) |
| `info` | Standard — default |
| `warn` | Warnings and errors only |
| `error` | Fatal errors only |

```bash
NADO_DOCS_LOG_LEVEL=debug pnpm docs:build:nado
```

---

## Project structure

```
app/                      # Next.js App Router (pages, layouts, API routes)
  api/
    pairs/                # Nado pairs list (Gateway proxy)
    wallet/[address]/     # Gateway proxy — subaccount info
    subaccounts/[address]/# Archive proxy — subaccounts list
    matches/              # Archive proxy — trade history (5-subaccount chunks)
    funding/              # Archive proxy — interest & funding
components/               # React components (wallet explorer…)
hooks/                    # Hooks (useWalletData, useLiquidationStream, useOrderBook…)
store/                    # Zustand stores (liquidation, pairs, wallet)
lib/
  docs-rag/               # Full RAG pipeline (crawler, chunker, embeddings, SQLite)
  schemas/                # Zod schemas — source of truth for Nado types
scripts/
  docs-rag/               # RAG pipeline CLI + committed config
    cli.ts                # Entry point for docs:* commands
    nado-docs.config.ts   # Non-secret config (base URL, concurrency, models…)
prisma/                   # Prisma schema + migrations
ws-proxy/                 # Bun WS Proxy (Railway) — Nado WebSocket relay
.claude/
  docs/                   # Nado docs (.md) + RAG index (rag.sqlite)
  docs/rag/               # Generated artifacts: pages-md/, pages-json/, crawl-state
```

---

## Architecture

See [`ARCHI.md`](ARCHI.md) for data flow, component breakdown, and technical decisions.

See [`CLAUDE.md`](CLAUDE.md) for development rules, stack constraints, and critical Nado API notes.
