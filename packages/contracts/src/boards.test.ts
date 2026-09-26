import { describe, expect, it } from "vitest";
import {
  boardListResponseSchema,
  boardMemberListResponseSchema,
  boardMemberSchema,
  boardRoleSchema,
  boardSummarySchema,
  createBoardRequestSchema,
  updateBoardRequestSchema,
} from "./boards.js";

const validSummary = {
  id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f2e",
  name: "Tokyo Zine Fair 2027",
  description: "Planning board",
  ownerId: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f2f",
  role: "ADMIN",
  memberCount: 3,
  memberPreview: [
    { id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f30", name: "Ada", avatarSeed: "seed-1" },
  ],
  version: 1,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
};

describe("board contracts", () => {
  it("accepts the documented board roles", () => {
    expect(boardRoleSchema.options).toEqual(["ADMIN", "MANAGER", "CONTRIBUTOR"]);
  });

  it("parses a board summary and rejects unknown fields", () => {
    expect(boardSummarySchema.parse(validSummary)).toMatchObject({ name: "Tokyo Zine Fair 2027" });
    expect(boardSummarySchema.safeParse({ ...validSummary, token: "leak" }).success).toBe(false);
  });

  it("normalizes a strict board creation request", () => {
    expect(createBoardRequestSchema.parse({ name: "  New board  ", description: "   " })).toEqual({
      name: "New board",
      description: null,
    });
    expect(createBoardRequestSchema.safeParse({ name: "", description: null }).success).toBe(false);
    expect(
      createBoardRequestSchema.safeParse({ name: "Board", description: null, ownerId: "user" })
        .success,
    ).toBe(false);
  });

  it("normalizes a strict board update request", () => {
    expect(
      updateBoardRequestSchema.parse({
        name: "  Updated board  ",
        description: "   ",
        version: 3,
      }),
    ).toEqual({ name: "Updated board", description: null, version: 3 });
    expect(
      updateBoardRequestSchema.safeParse({
        name: "Board",
        description: null,
        version: 0,
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      updateBoardRequestSchema.safeParse({ name: "", description: null, version: 1 }).success,
    ).toBe(false);
    expect(
      updateBoardRequestSchema.safeParse({ name: "Board", description: null, version: -1 }).success,
    ).toBe(false);
  });

  it("parses a paginated board list response", () => {
    const parsed = boardListResponseSchema.parse({ items: [validSummary], nextCursor: null });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.nextCursor).toBeNull();
  });

  it("never allows a password/hash/token field on a board member", () => {
    const member = {
      userId: validSummary.ownerId,
      boardId: validSummary.id,
      role: "CONTRIBUTOR",
      joinedAt: "2024-01-01T00:00:00.000Z",
      user: {
        id: validSummary.ownerId,
        name: "Ada",
        avatarSeed: "seed",
        email: "ada@example.test",
      },
    };
    expect(boardMemberSchema.parse(member)).toMatchObject({ role: "CONTRIBUTOR" });
    expect(
      boardMemberSchema.safeParse({ ...member, user: { ...member.user, password: "x" } }).success,
    ).toBe(false);
    expect(
      boardMemberListResponseSchema.parse({ items: [member], nextCursor: "abc" }).nextCursor,
    ).toBe("abc");
  });
});
