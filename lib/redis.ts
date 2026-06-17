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

export function logRedisError(op: "get" | "set", key: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : "unknown";
  console.error(`[redis:${op}] ${key.slice(0, 30)} — ${msg}`);
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get<T>(key);
    if (cached !== null) return cached;
  } catch (err) {
    logRedisError("get", key, err);
  }

  const result = await fetcher();

  try {
    await redis.set(key, result, { ex: ttlSeconds });
  } catch (err) {
    logRedisError("set", key, err);
  }

  return result;
}
