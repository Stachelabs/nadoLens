const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  grey: "\x1b[90m",
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "success"

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  success: 1,
  warn: 2,
  error: 3,
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: ANSI.grey,
  info: ANSI.cyan,
  success: ANSI.green,
  warn: ANSI.yellow,
  error: ANSI.red,
}

function minLevel(): LogLevel {
  const v = (process.env.NADO_DOCS_LOG_LEVEL ?? "info").toLowerCase()
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v
  return "info"
}

function ts(): string {
  return new Date().toTimeString().slice(0, 8) // HH:MM:SS
}

function formatMeta(
  meta?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!meta) return ""
  const parts = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${ANSI.dim}${k}${ANSI.reset}${ANSI.grey}=${ANSI.reset}${v}`)
  return parts.length ? "  " + parts.join("  ") : ""
}

let _lastProgressLen = 0

export function log(
  level: LogLevel,
  msg: string,
  meta?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return
  // Clear any in-progress line before printing
  if (_lastProgressLen > 0) {
    process.stdout.write("\r" + " ".repeat(_lastProgressLen) + "\r")
    _lastProgressLen = 0
  }
  const color = LEVEL_COLOR[level]
  const label = level.toUpperCase().padEnd(7)
  const line = `${ANSI.dim}[${ts()}]${ANSI.reset} ${color}${label}${ANSI.reset} ${msg}${formatMeta(meta)}\n`
  if (level === "error") {
    process.stderr.write(line)
  } else {
    process.stdout.write(line)
  }
}

/**
 * Overwrite the current line with a progress indicator.
 * Call clearProgress() before the next log() to avoid visual glitches.
 */
export function logProgress(current: number, total: number, label: string): void {
  if (!process.stdout.isTTY) return
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const line = `\r${ANSI.dim}[${ts()}]${ANSI.reset} ${ANSI.cyan}PROGRESS${ANSI.reset} [${current}/${total}] ${pct}%  ${label}`
  // Pad to erase previous longer line
  const padded = line.padEnd(_lastProgressLen)
  _lastProgressLen = line.length
  process.stdout.write(padded)
}

/** Clear the current progress line. */
export function clearProgress(): void {
  if (_lastProgressLen > 0 && process.stdout.isTTY) {
    process.stdout.write("\r" + " ".repeat(_lastProgressLen) + "\r")
    _lastProgressLen = 0
  }
}
