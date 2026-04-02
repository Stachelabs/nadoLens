import { loadDocsRagConfig } from "../../lib/docs-rag/config"
import { runDocsSync } from "../../lib/docs-rag/crawler"
import { runDocsIndex } from "../../lib/docs-rag/indexRunner"
import { log } from "../../lib/docs-rag/logger"
import { readManifest } from "../../lib/docs-rag/manifestIO"
import { paths } from "../../lib/docs-rag/paths"
import { writeCoverageReport } from "../../lib/docs-rag/report"
import { searchDocs } from "../../lib/docs-rag/query"
import { verifyManifest } from "../../lib/docs-rag/verify"

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  grey: "\x1b[90m",
}

const cmd = process.argv[2]

const HELP = `
Usage: pnpm docs:<command>:nado [options]

Commands:
  sync              Crawl docs.nado.xyz and save pages as markdown
  index             Chunk pages, embed with Ollama/OpenAI, store in SQLite
  verify            Check coverage and generate report
  build             Full pipeline: sync → index → verify
  query "<text>"    Semantic search over the local index

Query options:
  --top-k N         Number of results to return (default: 5)
  --filter <path>   Filter results by URL path prefix (e.g. /developer-resources/api)

Examples:
  pnpm docs:build:nado
  pnpm docs:query:nado "fee calculation matches archive"
  pnpm docs:query:nado "pagination idx" --top-k 3
  pnpm docs:query:nado "rate limits" --filter /developer-resources/api
`

async function runVerify(): Promise<number> {
  const start = Date.now()
  const m = await readManifest(paths.manifest)
  const v = verifyManifest(m)
  await writeCoverageReport(paths.report, m, v)
  const code = v.navMissing.length > 0 ? 1 : 0
  log("success", "verify_complete", {
    exit_code: code,
    nav_missing: v.navMissing.length,
    broken_links: v.brokenInternalLinks.length,
    report: paths.report,
    duration_s: ((Date.now() - start) / 1000).toFixed(1),
  })
  return code
}

async function runQuery(): Promise<void> {
  const args = process.argv.slice(3)
  let queryText = ""
  let topK = 5
  let filter: string | undefined

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--top-k" || args[i] === "-k") && args[i + 1]) {
      topK = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === "--filter" && args[i + 1]) {
      filter = args[i + 1]
      i++
    } else if (!args[i].startsWith("--")) {
      queryText = args[i]
    }
  }

  if (!queryText) {
    console.error(
      'Usage: pnpm docs:query:nado "<query>" [--top-k N] [--filter <path-prefix>]\n' +
        'Example: pnpm docs:query:nado "fee sequencer archive matches"',
    )
    process.exitCode = 1
    return
  }

  const start = Date.now()
  log("info", "query_start", {
    query: queryText,
    top_k: topK,
    filter: filter ?? "none",
  })

  const results = await searchDocs(
    queryText,
    topK,
    filter ? { pathPrefix: filter } : {},
  )

  const duration = ((Date.now() - start) / 1000).toFixed(2)

  console.log(
    `\n${ANSI.bold}Query${ANSI.reset}  ${ANSI.cyan}"${queryText}"${ANSI.reset}` +
      (filter ? `  ${ANSI.dim}filter: ${filter}${ANSI.reset}` : "") +
      "\n",
  )

  if (results.length === 0) {
    console.log(`  ${ANSI.grey}No results found.${ANSI.reset}\n`)
  } else {
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const pathname = (() => {
        try {
          return new URL(r.pageUrl).pathname
        } catch {
          return r.pageUrl
        }
      })()
      const preview = r.text.replace(/\s+/g, " ").trim().slice(0, 140)
      console.log(
        `  ${ANSI.bold}#${i + 1}${ANSI.reset}  ` +
          `score: ${ANSI.green}${r.score.toFixed(3)}${ANSI.reset}  ` +
          `${ANSI.cyan}${pathname}${ANSI.reset}`,
      )
      console.log(`      ${ANSI.dim}"${preview}…"${ANSI.reset}`)
      console.log()
    }
  }

  log("info", "query_complete", {
    results: results.length,
    duration_s: duration,
  })
}

async function main(): Promise<void> {
  if (cmd === "--help" || cmd === "-h") {
    console.log(HELP)
    return
  }

  const start = Date.now()

  switch (cmd) {
    case "sync": {
      const cfg = loadDocsRagConfig()
      await runDocsSync(cfg)
      return
    }
    case "index": {
      const cfg = loadDocsRagConfig()
      await runDocsIndex(cfg)
      return
    }
    case "verify": {
      const code = await runVerify()
      process.exitCode = code
      return
    }
    case "build": {
      const cfg = loadDocsRagConfig()
      log("info", "build_start", { steps: "sync → index → verify" })
      await runDocsSync(cfg)
      await runDocsIndex(cfg)
      const code = await runVerify()
      process.exitCode = code
      log("success", "build_complete", {
        exit_code: code,
        duration_s: ((Date.now() - start) / 1000).toFixed(1),
      })
      return
    }
    case "query": {
      await runQuery()
      return
    }
    default:
      console.error(HELP)
      process.exitCode = 1
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
