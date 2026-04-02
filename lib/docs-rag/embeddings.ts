import type { DocsRagConfig } from "./config"

/**
 * Ollama current API: POST /api/embed with `input` (string | string[]), returns `embeddings`.
 * Legacy: POST /api/embeddings with `prompt` (single), returns `embedding`.
 * @see https://docs.ollama.com/api/embed
 */
export async function embedTexts(
  texts: string[],
  cfg: DocsRagConfig,
): Promise<number[][]> {
  if (texts.length === 0) return []
  if (cfg.embedProvider === "ollama") {
    return embedOllama(texts, cfg)
  }

  const key = cfg.openaiApiKey
  if (!key) {
    throw new Error("OPENAI_API_KEY is required when NADO_DOCS_EMBED_PROVIDER=openai")
  }
  const base = cfg.openaiBaseUrl ?? "https://api.openai.com/v1"
  const r = await fetch(`${base.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: cfg.openaiEmbedModel,
      input: texts,
    }),
  })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`openai embeddings ${r.status}: ${body.slice(0, 200)}`)
  }
  const j = (await r.json()) as {
    data: Array<{ embedding: number[]; index: number }>
  }
  return j.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

async function embedOllama(
  texts: string[],
  cfg: DocsRagConfig,
): Promise<number[][]> {
  const host = cfg.ollamaHost.replace(/\/$/, "")

  const res = await fetch(`${host}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.ollamaEmbedModel,
      input: texts.length === 1 ? texts[0] : texts,
    }),
  })

  if (res.ok) {
    const j = (await res.json()) as { embeddings: number[][] }
    if (!j.embeddings?.length) {
      throw new Error("ollama /api/embed: missing embeddings array")
    }
    return j.embeddings
  }

  if (res.status === 404) {
    return embedOllamaLegacy(texts, cfg, host)
  }

  const body = await res.text()
  throw new Error(`ollama /api/embed ${res.status}: ${body.slice(0, 200)}`)
}

async function embedOllamaLegacy(
  texts: string[],
  cfg: DocsRagConfig,
  host: string,
): Promise<number[][]> {
  const out: number[][] = []
  for (const t of texts) {
    const r = await fetch(`${host}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.ollamaEmbedModel, prompt: t }),
    })
    if (!r.ok) {
      const body = await r.text()
      throw new Error(`ollama legacy embeddings ${r.status}: ${body.slice(0, 200)}`)
    }
    const j = (await r.json()) as { embedding: number[] }
    out.push(j.embedding)
  }
  return out
}
