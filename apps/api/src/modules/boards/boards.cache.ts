import { boardListResponseSchema, type BoardListResponse } from "@ksat/contracts";
import type { Logger } from "../../logging.js";
export interface BoardCacheRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}
const CACHE_VERSION = "v1";
const FIRST_PAGE_TTL_SECONDS = 45;
function firstPageKey(userId: string): string {
  return `ksat:cache:${CACHE_VERSION}:boards:user:${userId}:first-page`;
}
export interface BoardListCache {
  getFirstPage(userId: string): Promise<BoardListResponse | undefined>;
  setFirstPage(userId: string, response: BoardListResponse): Promise<void>;
  invalidateForUsers(userIds: readonly string[]): Promise<void>;
}
export function createBoardListCache(redis: BoardCacheRedis, logger: Logger): BoardListCache {
  return {
    async getFirstPage(userId): Promise<BoardListResponse | undefined> {
      try {
        const raw = await redis.get(firstPageKey(userId));
        if (!raw) return undefined;
        const parsed = boardListResponseSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : undefined;
      } catch (error) {
        logger.warn(
          { err: error, userId },
          "Board list cache read failed; falling back to the database",
        );
        return undefined;
      }
    },
    async setFirstPage(userId, response): Promise<void> {
      try {
        await redis.set(
          firstPageKey(userId),
          JSON.stringify(response),
          "EX",
          FIRST_PAGE_TTL_SECONDS,
        );
      } catch (error) {
        logger.warn({ err: error, userId }, "Board list cache write failed");
      }
    },
    async invalidateForUsers(userIds): Promise<void> {
      if (userIds.length === 0) return;
      try {
        await redis.del(...userIds.map((userId) => firstPageKey(userId)));
      } catch (error) {
        logger.warn({ err: error, count: userIds.length }, "Board list cache invalidation failed");
      }
    },
  };
}
export function createNoopBoardListCache(): BoardListCache {
  return {
    async getFirstPage(): Promise<BoardListResponse | undefined> {
      return undefined;
    },
    async setFirstPage(): Promise<void> {
      /* no-op */
    },
    async invalidateForUsers(): Promise<void> {
      /* no-op */
    },
  };
}
