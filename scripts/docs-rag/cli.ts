import { loadDocsRagConfig } from "../../lib/docs-rag/config"
import { runDocsSync } from "../../lib/docs-rag/crawler"
import { runDocsIndex } from "../../lib/docs-rag/indexRunner"
import { log } from "../../lib/docs-rag/logger"
import { readManifest } from "../../lib/docs-rag/manifestIO"
import { paths } from "../../lib/docs-rag/paths"
import { writeCoverageReport } from "../../lib/docs-rag/report"
import { verifyManifest } from "../../lib/docs-rag/verify"

const cmd = process.argv[2]

async function runVerify(): Promise<number> {
  const m = await readManifest(paths.manifest)
  const v = verifyManifest(m)
  await writeCoverageReport(paths.report, m, v)
  const code = v.navMissing.length > 0 ? 1 : 0
  log("info", "docs_verify_complete", {
    exit_code: code,
    nav_missing_count: v.navMissing.length,
    broken_internal_links_count: v.brokenInternalLinks.length,
    report_path: paths.report,
  })
  return code
}

async function main(): Promise<void> {
  const cfg = loadDocsRagConfig()
  switch (cmd) {
    case "sync":
      await runDocsSync(cfg)
      return
    case "index":
      await runDocsIndex(cfg)
      return
    case "verify": {
      const code = await runVerify()
      process.exitCode = code
      return
    }
    case "build": {
      log("info", "docs_build_step", { step: "sync_start" })
      await runDocsSync(cfg)
      log("info", "docs_build_step", { step: "sync_done" })
      await runDocsIndex(cfg)
      log("info", "docs_build_step", { step: "index_done" })
      const code = await runVerify()
      process.exitCode = code
      log("info", "docs_build_complete", { exit_code: code })
      return
    }
    default:
      console.error(
        "Usage: pnpm docs:sync:nado | pnpm docs:index:nado | pnpm docs:verify:nado | pnpm docs:build:nado",
      )
      process.exitCode = 1
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
