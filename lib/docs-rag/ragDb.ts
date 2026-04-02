import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import type { ChunkRecord } from "./types"

type SqliteDb = InstanceType<typeof Database>

export type RagDb = {
  sqlite: SqliteDb
  close: () => void
}

export function openRagDb(dbPath: string): RagDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const sqlite = new Database(dbPath)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      page_url TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      section_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding_dim INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      page_content_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks(page_url);
  `)
  return {
    sqlite,
    close: () => sqlite.close(),
  }
}

export function deleteChunksForPage(db: SqliteDb, pageUrl: string): void {
  db.prepare("DELETE FROM chunks WHERE page_url = ?").run(pageUrl)
}

export function insertChunk(
  db: SqliteDb,
  row: ChunkRecord,
  embedding: number[],
  pageContentHash: string,
): void {
  const buf = Buffer.from(new Float32Array(embedding).buffer)
  db.prepare(
    `INSERT OR REPLACE INTO chunks
      (id, page_url, chunk_index, text, section_path, content_hash, embedding_dim, embedding, page_content_hash)
     VALUES (@id, @page_url, @chunk_index, @text, @section_path, @content_hash, @embedding_dim, @embedding, @page_content_hash)`,
  ).run({
    id: row.id,
    page_url: row.pageUrl,
    chunk_index: row.chunkIndex,
    text: row.text,
    section_path: row.sectionPath,
    content_hash: row.contentHash,
    embedding_dim: embedding.length,
    embedding: buf,
    page_content_hash: pageContentHash,
  })
}

export function loadAllChunksForSearch(
  db: SqliteDb,
): Array<{ id: string; pageUrl: string; text: string; embedding: number[] }> {
  const rows = db
    .prepare(
      "SELECT id, page_url, text, embedding_dim, embedding FROM chunks",
    )
    .all() as Array<{
      id: string
      page_url: string
      text: string
      embedding_dim: number
      embedding: Buffer
    }>
  return rows.map((r) => {
    const floats = new Float32Array(
      r.embedding.buffer,
      r.embedding.byteOffset,
      r.embedding_dim,
    )
    return {
      id: r.id,
      pageUrl: r.page_url,
      text: r.text,
      embedding: [...floats],
    }
  })
}
