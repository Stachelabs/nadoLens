// ─── Server-side URLs (API routes only — never exposed to browser) ────────────
export const NADO_GATEWAY_REST =
  process.env.NADO_GATEWAY_REST ?? "https://gateway.prod.nado.xyz/v1";
export const NADO_ARCHIVE_REST =
  process.env.NADO_ARCHIVE_REST ?? "https://archive.prod.nado.xyz/v1";
// Nado migrated the undocumented points/airdrop endpoints off /v1 onto their own
// path — nado_points and ink_airdrop now 403 ("unknown variant") on /v1.
export const NADO_ARCHIVE_REWARDS_REST =
  process.env.NADO_ARCHIVE_REWARDS_REST ??
  "https://archive.prod.nado.xyz/rewards/v1";
export const NADO_GATEWAY_V2 =
  process.env.NADO_GATEWAY_V2 ?? "https://gateway.prod.nado.xyz/v2";
export const NADO_ARCHIVE_V2 =
  process.env.NADO_ARCHIVE_V2 ?? "https://archive.prod.nado.xyz/v2";

// ─── External microservice URLs (Fly.io — separate IP buckets from Vercel) ───
// CRITICAL: Call validateEnv() at startup to ensure these are set (lib/validateEnv.ts)
export const NADO_MATCHES_SERVICE_URL =
  process.env.NADO_MATCHES_SERVICE_URL ?? "";
export const NADO_FUNDING_SERVICE_URL =
  process.env.NADO_FUNDING_SERVICE_URL ?? "";

// ─── Trigger service (signed queries — EIP-712) ─────────────────────────────
export const NADO_TRIGGER_REST =
  process.env.NADO_TRIGGER_REST ?? "https://trigger.prod.nado.xyz/v1";

// ─── Client-safe URLs (NEXT_PUBLIC_ — visible dans le bundle browser) ─────────
// Utilisé par les hooks qui appellent Nado directement (ex: fetchMatches)
export const NADO_ARCHIVE_V1 =
  process.env.NEXT_PUBLIC_NADO_ARCHIVE_V1 ?? "https://archive.prod.nado.xyz/v1";

// Ink L2 public RPC — used to calibrate submission_idx → real block timestamp
export const INK_L2_RPC = "https://rpc-gel.inkonchain.com";
