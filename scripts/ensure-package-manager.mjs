/**
 * Refuses installs driven by npm (or yarn) so the repo stays on pnpm or bun.
 * Invoked from package.json "preinstall" via Node — not npm.
 */
const ua = process.env.npm_config_user_agent ?? ""

const isPnpm = /pnpm\//i.test(ua)
const isBun =
  /bun/i.test(ua) ||
  Boolean(process.env.BUN_INSTALL) ||
  (process.env.npm_execpath ?? "").toLowerCase().includes("bun")

if (ua && !isPnpm && !isBun) {
  console.error(
    "[nadolens] Use pnpm or bun to install dependencies (other package managers are not supported).",
  )
  process.exit(1)
}
