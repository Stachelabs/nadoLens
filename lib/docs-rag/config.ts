import { z } from "zod"

function envBool(
  v: string | undefined,
  defaultValue: boolean,
): boolean {
  if (v === undefined || v === "") return defaultValue
  return v === "1" || v === "true"
}

const BaseSchema = z.object({
  NADO_DOCS_BASE_URL: z.string().url().default("https://docs.nado.xyz"),
  NADO_DOCS_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  NADO_DOCS_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(4),
  NADO_DOCS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(45_000),
  NADO_DOCS_MAX_DEPTH: z.coerce.number().int().min(1).max(50).default(32),
  NADO_DOCS_MAX_FAIL_RATIO: z.coerce.number().min(0).max(1).default(0.08),
  NADO_DOCS_DRY_RUN_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(5),
  NADO_DOCS_EMBED_PROVIDER: z.enum(["ollama", "openai"]).default("ollama"),
  OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_EMBED_MODEL: z.string().min(1).default("nomic-embed-text"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_EMBED_MODEL: z.string().min(1).default("text-embedding-3-small"),
  NADO_DOCS_CHUNK_MAX_CHARS: z.coerce.number().int().min(400).max(8000).default(2200),
})

export type DocsRagConfig = {
  baseUrl: string
  concurrency: number
  maxRetries: number
  timeoutMs: number
  maxDepth: number
  maxFailRatio: number
  dryRun: boolean
  resume: boolean
  dryRunMaxPages: number
  embedProvider: "ollama" | "openai"
  ollamaHost: string
  ollamaEmbedModel: string
  openaiApiKey: string | undefined
  openaiBaseUrl: string | undefined
  openaiEmbedModel: string
  chunkMaxChars: number
  integration: boolean
}

export function loadDocsRagConfig(env: NodeJS.ProcessEnv = process.env): DocsRagConfig {
  const raw = BaseSchema.safeParse(env)
  if (!raw.success) {
    throw new Error(`Invalid docs-rag env: ${raw.error.message}`)
  }
  const e = raw.data
  return {
    baseUrl: e.NADO_DOCS_BASE_URL.replace(/\/$/, ""),
    concurrency: e.NADO_DOCS_CONCURRENCY,
    maxRetries: e.NADO_DOCS_MAX_RETRIES,
    timeoutMs: e.NADO_DOCS_TIMEOUT_MS,
    maxDepth: e.NADO_DOCS_MAX_DEPTH,
    maxFailRatio: e.NADO_DOCS_MAX_FAIL_RATIO,
    dryRun: envBool(env.NADO_DOCS_DRY_RUN, false),
    resume: envBool(env.NADO_DOCS_RESUME, false),
    dryRunMaxPages: e.NADO_DOCS_DRY_RUN_MAX_PAGES,
    embedProvider: e.NADO_DOCS_EMBED_PROVIDER,
    ollamaHost: e.OLLAMA_HOST.replace(/\/$/, ""),
    ollamaEmbedModel: e.OLLAMA_EMBED_MODEL,
    openaiApiKey: e.OPENAI_API_KEY,
    openaiBaseUrl: e.OPENAI_BASE_URL,
    openaiEmbedModel: e.OPENAI_EMBED_MODEL,
    chunkMaxChars: e.NADO_DOCS_CHUNK_MAX_CHARS,
    integration: envBool(env.NADO_DOCS_INTEGRATION, false),
  }
}
