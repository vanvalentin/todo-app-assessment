export interface RedisStorageClient {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  increment(key: string, ttl: number): Promise<number>;
  set(key: string, value: string, ttl?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface MemoryValue {
  readonly value: string;
  readonly expiresAt: number;
}

export interface SecondaryStorage {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  increment(key: string, ttl: number): Promise<number>;
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
  const getAndDeleteMemory = (key: string): string | null => {
    const value = getMemory(key);
    memory.delete(key);
    return value;
  };
  const incrementMemory = (key: string, ttl: number): number => {
    const existing = getMemory(key);
    const next = existing === null ? 1 : Number.parseInt(existing, 10) + 1;
    const expiresAt =
      existing === null ? Date.now() + ttl * 1_000 : (memory.get(key)?.expiresAt ?? Date.now());
    memory.set(key, { value: String(next), expiresAt });
    return next;
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
    async getAndDelete(key): Promise<string | null> {
      const redisKey = namespaced(key);
      try {
        const value = await redis.getAndDelete(redisKey);
        memory.delete(redisKey);
        return value;
      } catch {
        return getAndDeleteMemory(redisKey);
      }
    },
    async increment(key, ttl): Promise<number> {
      const redisKey = namespaced(key);
      try {
        return await redis.increment(redisKey, ttl);
      } catch {
        return incrementMemory(redisKey, ttl);
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
