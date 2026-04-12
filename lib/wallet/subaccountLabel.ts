/** Same rules as WalletPositions `normalizeCrossLabel` — default → main, default_n → n. */
export function normalizeSubaccountDisplayName(name?: string): string {
  if (!name) return "main";
  if (name === "default") return "main";
  const m = /^default_(\d+)$/.exec(name);
  if (m) return m[1] ?? "main";
  return name;
}

/** Sort key: main first, then numeric 1,2,3…, then others last. */
export function subaccountDisplayLabelSortKey(label: string): number {
  if (label === "main") return 0;
  const n = Number.parseInt(label, 10);
  if (Number.isFinite(n)) return n;
  return Number.MAX_SAFE_INTEGER;
}
