export type LogLevel = "debug" | "info" | "warn" | "error"

export function log(
  level: LogLevel,
  msg: string,
  meta?: Record<string, string | number | boolean | null | undefined>,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  }
  console.log(JSON.stringify(line))
}
