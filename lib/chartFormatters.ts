const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const hourFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})

const shortFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

export function fmtDate(ts: number): string {
  return dateFmt.format(new Date(ts * 1000))
}

export function fmtHour(ts: number): string {
  return hourFmt.format(new Date(ts * 1000))
}

export function fmtDateShort(ts: number): string {
  return shortFmt.format(new Date(ts * 1000))
}

export function weekLabel(ts: number): string {
  return `${fmtDateShort(ts - 7 * 86400)} – ${fmtDateShort(ts)}`
}

export const fmtCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const fmtCompact2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function fmtAxis(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}
