export interface RedisStorageClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface MemoryValue {
  readonly value: string;
  readonly expiresAt: number;
}

export interface SecondaryStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Better Auth's secondary storage is an optimization for durable PostgreSQL
 * records. Redis errors are treated as cache misses/no-ops so they can never
 * turn a failed cache read into an authenticated session. A small process-local
 * fallback keeps rate limits useful during a Redis interruption; database-backed
 * sessions remain authoritative.
 */
export function createResilientSecondaryStorage(redis: RedisStorageClient): SecondaryStorage {
  const memory = new Map<string, MemoryValue>();
  const namespaced = (key: string): string => `ksat:better-auth:${key}`;

  const getMemory = (key: string): string | null => {
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      memory.delete(key);
      return null;
    }
    return entry.value;
  };

  return {
    async get(key): Promise<string | null> {
      const redisKey = namespaced(key);
      try {
        const value = await redis.get(redisKey);
        return value ?? getMemory(redisKey);
      } catch {
        return getMemory(redisKey);
      }
    },
    async set(key, value, ttl): Promise<void> {
      const redisKey = namespaced(key);
      // Better Auth serializes rate-limit records with these two fields. Do not
      // cache session payloads in process memory: a failed DB write must not
      // leave an authenticating value behind during a Redis outage.
      let isRateLimitRecord = false;
      try {
        const parsed: unknown = JSON.parse(value);
        // Narrow boundary for Better Auth's documented rate-limit value shape.
        const candidate = parsed as { count?: unknown; lastRequest?: unknown };
        isRateLimitRecord =
          typeof candidate.count === "number" && typeof candidate.lastRequest === "number";
      } catch {
        isRateLimitRecord = false;
      }
      if (isRateLimitRecord) {
        const expiresAt = Date.now() + (ttl ?? 60 * 60 * 24 * 7) * 1_000;
        memory.set(redisKey, { value, expiresAt });
      }
      try {
        await redis.set(redisKey, value, ttl);
      } catch {
        // The process-local value is intentionally retained until its TTL.
      }
    },
    async delete(key): Promise<void> {
      const redisKey = namespaced(key);
      memory.delete(redisKey);
      try {
        await redis.del(redisKey);
      } catch {
        // A failed cache deletion cannot grant access: DB-backed auth remains authoritative.
      }
    },
  };
}
