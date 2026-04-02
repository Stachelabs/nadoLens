import { sha256Hex } from "./hash"
import type { ChunkRecord } from "./types"

export type ChunkerOptions = {
  /** Rough char budget per chunk (proxy for tokens). */
  maxChars: number
  /** Minimum chunk size before merging with next (avoid tiny fragments). */
  minChars: number
}

const DEFAULTS: ChunkerOptions = {
  maxChars: 2200,
  minChars: 120,
}

/**
 * Split markdown into heading-based chunks, then subdivide oversized sections.
 */
export function chunkMarkdown(
  pageUrl: string,
  markdown: string,
  sectionPath: string,
  options: Partial<ChunkerOptions> = {},
): ChunkRecord[] {
  const opts = { ...DEFAULTS, ...options }
  const lines = markdown.split("\n")
  const sections: string[] = []
  let buf: string[] = []

  const flush = () => {
    const t = buf.join("\n").trim()
    if (t.length > 0) sections.push(t)
    buf = []
  }

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      flush()
    }
    buf.push(line)
  }
  flush()

  const rawChunks: string[] = []
  for (const sec of sections) {
    if (sec.length <= opts.maxChars) {
      rawChunks.push(sec)
      continue
    }
    rawChunks.push(...splitBySize(sec, opts.maxChars))
  }

  const merged: string[] = []
  for (const c of rawChunks) {
    if (merged.length === 0) {
      merged.push(c)
      continue
    }
    const last = merged[merged.length - 1]
    if (last.length < opts.minChars && last.length + c.length <= opts.maxChars * 1.2) {
      merged[merged.length - 1] = `${last}\n\n${c}`
    } else {
      merged.push(c)
    }
  }

  return merged.map((text, chunkIndex): ChunkRecord => {
    const contentHash = sha256Hex(text)
    const id = sha256Hex(`${pageUrl}#${chunkIndex}#${contentHash}`).slice(0, 32)
    return {
      id,
      pageUrl,
      chunkIndex,
      text,
      sectionPath,
      contentHash,
    }
  })
}

/**
 * Split a text block by size, preferring to break at a newline or space
 * within the last 200 chars of the budget to avoid mid-word cuts.
 */
function splitBySize(text: string, maxChars: number): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length)
    if (end < text.length) {
      // Walk back up to 200 chars to find a natural break
      let boundary = -1
      for (let j = end; j > end - 200 && j > i; j--) {
        if (text[j] === "\n" || text[j] === " ") {
          boundary = j
          break
        }
      }
      if (boundary !== -1) end = boundary + 1
    }
    out.push(text.slice(i, end))
    i = end
  }
  return out.filter((s) => s.trim().length > 0)
}
