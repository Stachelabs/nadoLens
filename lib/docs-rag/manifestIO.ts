import fs from "node:fs/promises"
import { ManifestSchema, type Manifest } from "./types"

export async function readManifest(path: string): Promise<Manifest> {
  const raw = await fs.readFile(path, "utf8")
  const j: unknown = JSON.parse(raw)
  return ManifestSchema.parse(j)
}
