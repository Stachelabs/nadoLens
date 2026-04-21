import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

export const redis = Redis.fromEnv();

export function cacheKey(...parts: string[]): string {
  return `nado:${parts.join(":")}`;
}

export function hashParams(params: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 16);
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get<T>(key);
    if (cached !== null) return cached;
  } catch {
    // Cache unavailable — fall through to fetcher
  }

  const result = await fetcher();

  try {
    await redis.set(key, result, { ex: ttlSeconds });
  } catch {
    // Cache write failure is non-fatal
  }

  return result;
}
