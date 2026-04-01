import { z } from "zod"

export const PageStatusSchema = z.enum(["ok", "failed"])
export type PageStatus = z.infer<typeof PageStatusSchema>

export const PageRecordSchema = z.object({
  url: z.string(),
  status: PageStatusSchema,
  httpStatus: z.number().optional(),
  contentHash: z.string().optional(),
  depth: z.number(),
  parents: z.array(z.string()),
  fetchedAt: z.string().optional(),
  error: z.string().optional(),
  finalUrl: z.string().optional(),
  redirectedFrom: z.string().optional(),
  title: z.string().optional(),
  lastModified: z.string().optional(),
  headings: z.array(z.string()).optional(),
  linksOut: z
    .array(
      z.object({
        href: z.string(),
        text: z.string().optional(),
      }),
    )
    .optional(),
})

export type PageRecord = z.infer<typeof PageRecordSchema>

export const ManifestSchema = z.object({
  baseUrl: z.string(),
  syncedAt: z.string(),
  totalDiscovered: z.number(),
  totalOk: z.number(),
  totalFailed: z.number(),
  pages: z.array(PageRecordSchema),
  linksGraph: z.record(z.string(), z.array(z.string())),
  redirectMap: z.record(z.string(), z.string()),
  navLinksExpected: z.array(z.string()),
  sitemapUrls: z.array(z.string()),
  options: z
    .object({
      concurrency: z.number(),
      maxRetries: z.number(),
      timeoutMs: z.number(),
      dryRun: z.boolean(),
    })
    .optional(),
})

export type Manifest = z.infer<typeof ManifestSchema>

export type CrawlQueueItem = {
  url: string
  depth: number
  parent: string | null
}

export type ChunkRecord = {
  id: string
  pageUrl: string
  chunkIndex: number
  text: string
  sectionPath: string
  contentHash: string
}
