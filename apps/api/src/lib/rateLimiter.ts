export interface RateLimitRedis {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  ttl(key: string): Promise<number>;
}
export interface RateLimiterOptions {
  /** Maximum number of Redis-fallback buckets retained by this API process. */
  readonly maxMemoryBuckets?: number;
  /** Minimum interval between full fallback-bucket sweeps. */
  readonly memorySweepIntervalMs?: number;
}
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetSeconds: number;
}
export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}
interface MemoryBucket {
  count: number;
  resetAt: number;
}
export function createRateLimiter(
  redis: RateLimitRedis,
  options: RateLimiterOptions = {},
): RateLimiter {
  const maxMemoryBuckets = Math.max(1, Math.floor(options.maxMemoryBuckets ?? 10_000));
  const memorySweepIntervalMs = Math.max(1_000, options.memorySweepIntervalMs ?? 60_000);
  const memory = new Map<string, MemoryBucket>();
  let nextSweepAt = 0;
  const sweepMemory = (now: number): void => {
    if (now < nextSweepAt) return;
    for (const [key, bucket] of memory) {
      if (bucket.resetAt <= now) memory.delete(key);
    }
    nextSweepAt = now + memorySweepIntervalMs;
  };
  const evictOldest = (): void => {
    let oldestKey: string | undefined;
    let oldestResetAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of memory) {
      if (bucket.resetAt < oldestResetAt) {
        oldestKey = key;
        oldestResetAt = bucket.resetAt;
      }
    }
    if (oldestKey !== undefined) memory.delete(oldestKey);
  };
  const namespaced = (key: string): string => `ksat:rate-limit:${key}`;
  const consumeMemory = (key: string, limit: number, windowSeconds: number): RateLimitResult => {
    const now = Date.now();
    sweepMemory(now);
    const existing = memory.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSeconds * 1_000;
      if (memory.size >= maxMemoryBuckets) evictOldest();
      memory.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
    }
    existing.count += 1;
    const resetSeconds = Math.max(0, Math.ceil((existing.resetAt - now) / 1_000));
    return {
      allowed: existing.count <= limit,
      remaining: Math.max(0, limit - existing.count),
      resetSeconds,
    };
  };
  return {
    async consume(rawKey, limit, windowSeconds): Promise<RateLimitResult> {
      const key = namespaced(rawKey);
      try {
        const count = await redis.eval(
          "local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return value",
          1,
          key,
          windowSeconds,
        );
        if (typeof count !== "number")
          throw new Error("Redis returned an invalid rate-limit counter");
        const ttl = await redis.ttl(key);
        const resetSeconds = ttl > 0 ? ttl : windowSeconds;
        return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSeconds };
      } catch {
        return consumeMemory(key, limit, windowSeconds);
      }
    },
  };
}
export function createNoopRateLimiter(): RateLimiter {
  return {
    async consume(): Promise<RateLimitResult> {
      return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetSeconds: 0 };
    },
  };
}
