import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/lib/cursor.js";
import { createRateLimiter } from "../src/lib/rateLimiter.js";
import { hashInvitationToken } from "../src/lib/tokens.js";
import { createBoardListCache } from "../src/modules/boards/boards.cache.js";
import { createLogger } from "../src/logging.js";

describe("phase 3 primitives", () => {
  it("round-trips opaque cursors and rejects malformed values", () => {
    const cursor = encodeCursor({
      k: "2027-01-01T00:00:00.000Z",
      id: "01900000-0000-7000-8000-000000000001",
    });
    expect(cursor).not.toContain("2027");
    expect(decodeCursor(cursor)).toEqual({
      k: "2027-01-01T00:00:00.000Z",
      id: "01900000-0000-7000-8000-000000000001",
    });
    expect(decodeCursor("not-json")).toBeUndefined();
    expect(
      decodeCursor(encodeCursor({ k: "not-a-date", id: "01900000-0000-7000-8000-000000000001" })),
    ).toBeUndefined();
    expect(
      decodeCursor(encodeCursor({ k: "2027-01-01T00:00:00.000Z", id: "not-a-uuid" })),
    ).toBeUndefined();
  });
  it("hashes invitation tokens without retaining the plaintext", () => {
    expect(hashInvitationToken("secret-token")).toHaveLength(64);
    expect(hashInvitationToken("secret-token")).toBe(hashInvitationToken("secret-token"));
    expect(hashInvitationToken("secret-token")).not.toContain("secret-token");
  });
  it("uses bounded memory rate limits when Redis fails", async () => {
    const limiter = createRateLimiter(
      {
        eval: async () => {
          throw new Error("offline");
        },
        ttl: async () => {
          throw new Error("offline");
        },
      },
      { maxMemoryBuckets: 2 },
    );
    await expect(limiter.consume("user-1", 1, 60)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(limiter.consume("user-1", 1, 60)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
    await limiter.consume("user-2", 1, 60);
    await limiter.consume("user-3", 1, 60);
    await expect(limiter.consume("user-1", 2, 60)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
  it("treats cache Redis failures as misses", async () => {
    const cache = createBoardListCache(
      {
        get: async () => {
          throw new Error("offline");
        },
        set: async () => {
          throw new Error("offline");
        },
        del: async () => 0,
      },
      createLogger("silent"),
    );
    await expect(cache.getFirstPage("user-1")).resolves.toBeUndefined();
    await expect(
      cache.setFirstPage("user-1", { items: [], nextCursor: null }),
    ).resolves.toBeUndefined();
    await expect(cache.invalidateForUsers(["user-1"])).resolves.toBeUndefined();
  });
});
