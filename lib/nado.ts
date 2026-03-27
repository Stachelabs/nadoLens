// ─── Server-side URLs (API routes only — never exposed to browser) ────────────
export const NADO_GATEWAY_REST =
  process.env.NADO_GATEWAY_REST ?? "https://gateway.prod.nado.xyz/v1";
export const NADO_ARCHIVE_REST =
  process.env.NADO_ARCHIVE_REST ?? "https://archive.prod.nado.xyz/v1";
export const NADO_GATEWAY_V2 =
  process.env.NADO_GATEWAY_V2 ?? "https://gateway.prod.nado.xyz/v2";
export const NADO_ARCHIVE_V2 =
  process.env.NADO_ARCHIVE_V2 ?? "https://archive.prod.nado.xyz/v2";

// ─── Client-safe URLs (NEXT_PUBLIC_ — visible dans le bundle browser) ─────────
// Utilisé par les hooks qui appellent Nado directement (ex: fetchMatches)
export const NADO_ARCHIVE_V1 =
  process.env.NEXT_PUBLIC_NADO_ARCHIVE_V1 ?? "https://archive.prod.nado.xyz/v1";
