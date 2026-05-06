/**
 * Non-secret defaults for scripts/icons-sync/sync-nado-perp-svgs.ts.
 * Commit-safe config: keep secrets out of this file.
 *
 * Edit this file for your team's standard behavior.
 * Env vars can still override these values when needed.
 *
 * --- Brave CDP Profile ---
 * A dedicated Brave profile with Rabby Wallet (burner account) lives at:
 *   ~/brave-nado-playwright
 *
 * Launch it before running icons:sync-nado-perps:
 *   "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
 *     --remote-debugging-port=9222 --no-first-run --no-default-browser-check \
 *     --user-data-dir=$HOME/brave-nado-playwright
 */
export const nadoPerpIconsDefaults = {
  NADO_GATEWAY_V2: "https://gateway.prod.nado.xyz/v2",
  ICONS_OUTPUT_DIR: "public/icons/perps",
  PLAYWRIGHT_CDP_URL: "http://127.0.0.1:9222",
  PLAYWRIGHT_HEADED: "0",
  ICONS_DELAY_MS: "800",
  ICONS_ONLY: "",
  ICONS_DEBUG: "0",
} satisfies Record<string, string>
