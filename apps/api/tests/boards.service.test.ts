import type { UpdateBoardRequest } from "@ksat/contracts";
import { describe, expect, it, vi } from "vitest";
import { createBoardsService } from "../src/modules/boards/boards.service.js";
import type { BoardListCache } from "../src/modules/boards/boards.cache.js";
import type { BoardWithRole, BoardsRepository } from "../src/modules/boards/boards.types.js";

const board: BoardWithRole = {
  id: "01900000-0000-7000-8000-000000000001",
  name: "Updated board",
  description: null,
  ownerId: "01900000-0000-7000-8000-000000000002",
  role: "ADMIN",
  memberCount: 2,
  memberPreview: [],
  version: 2,
  createdAt: new Date("2027-01-01T00:00:00.000Z"),
  updatedAt: new Date("2027-01-02T00:00:00.000Z"),
};
const input: UpdateBoardRequest = { name: "Updated board", description: null, version: 1 };

function repository(overrides: Partial<BoardsRepository> = {}): BoardsRepository {
  return {
    createBoardForOwner: async () => board,
    findMembershipRole: async () => "ADMIN",
    updateBoardForAdmin: async () => ({ kind: "UPDATED", board, memberIds: ["user-1", "user-2"] }),
    listBoardsForMember: async () => ({ items: [], hasMore: false }),
    getBoardForMember: async () => board,
    listMembers: async () => ({ items: [], hasMore: false }),
    ...overrides,
  };
}

function cache(): BoardListCache & { invalidated: string[][] } {
  const invalidated: string[][] = [];
  return {
    invalidated,
    getFirstPage: async () => undefined,
    setFirstPage: async () => undefined,
    invalidateForUsers: async (userIds) => {
      invalidated.push([...userIds]);
    },
  };
}

describe("boards service update", () => {
  it("creates a board and invalidates the creator's list cache", async () => {
    const boardCache = cache();
    const create = vi.fn(async () => board);
    const service = createBoardsService({
      repository: repository({ createBoardForOwner: create }),
      cache: boardCache,
    });

    await expect(
      service.createBoard("user-1", { name: "Updated board", description: null }),
    ).resolves.toMatchObject({ role: "ADMIN", memberCount: 2 });
    expect(create).toHaveBeenCalledWith("user-1", {
      name: "Updated board",
      description: null,
    });
    expect(boardCache.invalidated).toEqual([["user-1"]]);
  });

  it("updates an admin board and invalidates every member's list cache", async () => {
    const boardCache = cache();
    const service = createBoardsService({ repository: repository(), cache: boardCache });

    await expect(service.updateBoard("user-1", board.id, input)).resolves.toMatchObject({
      name: "Updated board",
      version: 2,
    });
    expect(boardCache.invalidated).toEqual([["user-1", "user-2"]]);
  });

  it("rejects non-admins and non-members before mutation", async () => {
    const update = vi.fn(async () => ({ kind: "UPDATED" as const, board, memberIds: [] }));
    const boardCache = cache();
    const service = createBoardsService({
      repository: repository({
        findMembershipRole: async () => "MANAGER",
        updateBoardForAdmin: update,
      }),
      cache: boardCache,
    });
    await expect(service.updateBoard("user-1", board.id, input)).rejects.toMatchObject({
      status: 403,
      code: "BOARD_ADMIN_REQUIRED",
    });
    expect(update).not.toHaveBeenCalled();

    const missingService = createBoardsService({
      repository: repository({ findMembershipRole: async () => null, updateBoardForAdmin: update }),
      cache: boardCache,
    });
    await expect(missingService.updateBoard("user-3", board.id, input)).rejects.toMatchObject({
      status: 404,
      code: "BOARD_NOT_FOUND",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("maps a stale repository result without invalidating cache", async () => {
    const boardCache = cache();
    const service = createBoardsService({
      repository: repository({ updateBoardForAdmin: async () => ({ kind: "VERSION_CONFLICT" }) }),
      cache: boardCache,
    });
    await expect(service.updateBoard("user-1", board.id, input)).rejects.toMatchObject({
      status: 409,
      code: "BOARD_VERSION_CONFLICT",
    });
    expect(boardCache.invalidated).toEqual([]);
  });
});
