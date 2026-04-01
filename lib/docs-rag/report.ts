import fs from "node:fs/promises"
import path from "node:path"
import type { VerifyResult } from "./verify"
import type { Manifest } from "./types"

export async function writeCoverageReport(
  outPath: string,
  manifest: Manifest,
  verify: VerifyResult,
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true })

  const navOk = verify.navMissing.length === 0
  const lines: string[] = [
    "# Nado docs crawl — coverage report",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Base URL: ${manifest.baseUrl}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Pages discovered (manifest rows) | ${manifest.totalDiscovered} |`,
    `| Pages fetched OK | ${manifest.totalOk} |`,
    `| Pages failed | ${manifest.totalFailed} |`,
    `| Sitemap URLs | ${manifest.sitemapUrls.length} |`,
    `| Nav links captured (homepage) | ${manifest.navLinksExpected.length} |`,
    `| Nav links missing from OK set | ${verify.navMissing.length} |`,
    `| Internal links broken (target not OK) | ${verify.brokenInternalLinks.length} |`,
    `| Sitemap URLs not in OK set | ${verify.sitemapNotFetched.length} |`,
    "",
    "## Nav coverage assertion",
    "",
    navOk
      ? "**PASS**: 0 nav link missing (all sidebar/nav URLs were fetched successfully)."
      : `**FAIL**: ${verify.navMissing.length} nav link(s) missing from successful fetches.`,
    "",
  ]

  if (verify.navMissing.length > 0) {
    lines.push("### Missing nav URLs", "")
    for (const u of verify.navMissing) {
      lines.push(`- ${u}`)
    }
    lines.push("")
  }

  if (verify.brokenInternalLinks.length > 0) {
    lines.push("## Broken internal links (sample up to 50)", "")
    for (const b of verify.brokenInternalLinks.slice(0, 50)) {
      lines.push(`- \`${b.from}\` → \`${b.to}\``)
    }
    lines.push("")
  }

  if (verify.sitemapNotFetched.length > 0) {
    lines.push("## Sitemap URLs not present in OK pages (sample up to 50)", "")
    for (const u of verify.sitemapNotFetched.slice(0, 50)) {
      lines.push(`- ${u}`)
    }
    lines.push("")
  }

  lines.push("## Notes", "", `- Synced at: ${manifest.syncedAt}`, "")

  await fs.writeFile(outPath, lines.join("\n"), "utf8")
}
