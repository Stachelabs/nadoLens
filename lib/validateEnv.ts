import { z } from "zod";

const EnvSchema = z.object({
  // Server-side (required at runtime)
  NADO_MATCHES_SERVICE_URL: z.string().url("NADO_MATCHES_SERVICE_URL must be a valid URL"),
  NADO_FUNDING_SERVICE_URL: z.string().url("NADO_FUNDING_SERVICE_URL must be a valid URL"),
  SERVICE_SECRET: z.string().min(1, "SERVICE_SECRET is required"),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),

  // Public (required at build time, validated here for completeness)
  NEXT_PUBLIC_WS_PROXY_URL: z.string().url("NEXT_PUBLIC_WS_PROXY_URL must be a valid URL"),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1, "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validates all required environment variables at runtime.
 * Call this function at the top of your API route or server-side code.
 *
 * @throws {Error} with a clear message listing all missing or invalid vars
 * @returns {Env} typed environment object
 *
 * @example
 * ```ts
 * import { validateEnv } from "@/lib/validateEnv";
 *
 * export async function GET(request: NextRequest) {
 *   const env = validateEnv();
 *   // env.NADO_MATCHES_SERVICE_URL is now typed and guaranteed to exist
 * }
 * ```
 */
export function validateEnv(): Env {
  const result = EnvSchema.safeParse({
    NADO_MATCHES_SERVICE_URL: process.env.NADO_MATCHES_SERVICE_URL,
    NADO_FUNDING_SERVICE_URL: process.env.NADO_FUNDING_SERVICE_URL,
    SERVICE_SECRET: process.env.SERVICE_SECRET,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    NEXT_PUBLIC_WS_PROXY_URL: process.env.NEXT_PUBLIC_WS_PROXY_URL,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Missing or invalid environment variables:\n${errors}\n\nPlease check your .env file and CLAUDE.md for required values.`,
    );
  }

  return result.data;
}
