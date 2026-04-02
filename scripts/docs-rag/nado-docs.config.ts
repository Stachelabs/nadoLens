/**
 * Non-secret configuration for the Nado docs RAG pipeline.
 * This file is committed to git — do NOT put secrets here.
 * Secret overrides (e.g. OPENAI_API_KEY) go in .env only.
 *
 * These values serve as defaults. Any matching env var takes precedence.
 */
export const nadoDocsDefaults = {
  NADO_DOCS_BASE_URL: "https://docs.nado.xyz",
  NADO_DOCS_CONCURRENCY: "2",
  NADO_DOCS_MAX_RETRIES: "4",
  NADO_DOCS_TIMEOUT_MS: "45000",
  NADO_DOCS_MAX_DEPTH: "32",
  NADO_DOCS_MAX_FAIL_RATIO: "0.08",
  NADO_DOCS_DRY_RUN_MAX_PAGES: "5",
  NADO_DOCS_CHUNK_MAX_CHARS: "2200",
  NADO_DOCS_LOG_LEVEL: "info",
  NADO_DOCS_EMBED_BATCH_SIZE: "12",
  NADO_DOCS_EMBED_PROVIDER: "ollama",
  OLLAMA_HOST: "http://127.0.0.1:11434",
  OLLAMA_EMBED_MODEL: "nomic-embed-text",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_EMBED_MODEL: "text-embedding-3-small",
} satisfies Record<string, string>
