import path from "node:path"

/** Root for generated RAG artifacts (under repo). */
export const DOCS_RAG_SUBDIR = path.join(".claude", "docs", "rag")

export const paths = {
  manifest: path.join(".claude", "docs", "nado-manifest.json"),
  report: path.join(".claude", "docs", "reports", "nado-coverage-report.md"),
  crawlState: path.join(DOCS_RAG_SUBDIR, "crawl-state.json"),
  sqlite: path.join(DOCS_RAG_SUBDIR, "rag.sqlite"),
  pagesJsonDir: path.join(DOCS_RAG_SUBDIR, "pages-json"),
  pagesMdDir: path.join(DOCS_RAG_SUBDIR, "pages-md"),
  linkGraph: path.join(DOCS_RAG_SUBDIR, "link-graph.json"),
} as const
