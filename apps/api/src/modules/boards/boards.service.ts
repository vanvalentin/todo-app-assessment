import type {
  BoardListResponse,
  BoardMember,
  CreateBoardRequest,
  BoardMemberListResponse,
  BoardSummary,
  UpdateBoardRequest,
} from "@ksat/contracts";
import { HttpError } from "../../errors.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import type { BoardListCache } from "./boards.cache.js";
import type { BoardMemberRow, BoardWithRole, BoardsRepository } from "./boards.types.js";
export const DEFAULT_BOARD_LIST_LIMIT = 50;
export interface PageQuery {
  readonly cursor?: string;
  readonly limit: number;
}
export interface BoardsServiceDeps {
  readonly repository: BoardsRepository;
  readonly cache: BoardListCache;
}
export interface BoardsService {
  createBoard(userId: string, input: CreateBoardRequest): Promise<BoardSummary>;
  listBoards(userId: string, query: PageQuery): Promise<BoardListResponse>;
  getBoard(userId: string, boardId: string): Promise<BoardSummary>;
  updateBoard(userId: string, boardId: string, input: UpdateBoardRequest): Promise<BoardSummary>;
  listMembers(userId: string, boardId: string, query: PageQuery): Promise<BoardMemberListResponse>;
}
function toBoardSummary(board: BoardWithRole): BoardSummary {
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    ownerId: board.ownerId,
    role: board.role,
    memberCount: board.memberCount,
    memberPreview: board.memberPreview.map((member) => ({
      id: member.id,
      name: member.name,
      avatarSeed: member.avatarSeed,
    })),
    version: board.version,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}
function toBoardMember(row: BoardMemberRow): BoardMember {
  return {
    userId: row.userId,
    boardId: row.boardId,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
    user: row.user,
  };
}
function boardNotFound(): HttpError {
  return new HttpError(404, "BOARD_NOT_FOUND", "The board was not found.");
}
function cursorFor(value: string | undefined): { k: string; id: string } | undefined {
  return value === undefined ? undefined : decodeCursor(value);
}
export function createBoardsService({ repository, cache }: BoardsServiceDeps): BoardsService {
  return {
    async createBoard(userId, input): Promise<BoardSummary> {
      const board = await repository.createBoardForOwner(userId, input);
      await cache.invalidateForUsers([userId]);
      return toBoardSummary(board);
    },
    async listBoards(userId, query): Promise<BoardListResponse> {
      const useCache = query.cursor === undefined && query.limit === DEFAULT_BOARD_LIST_LIMIT;
      if (useCache) {
        const cached = await cache.getFirstPage(userId);
        if (cached) return cached;
      }
      const cursor = cursorFor(query.cursor);
      if (query.cursor !== undefined && !cursor)
        throw new HttpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
      const page = await repository.listBoardsForMember(userId, {
        cursorKey: cursor?.k,
        cursorId: cursor?.id,
        limit: query.limit,
      });
      const lastItem = page.items.at(-1);
      const response: BoardListResponse = {
        items: page.items.map(toBoardSummary),
        nextCursor:
          page.hasMore && lastItem
            ? encodeCursor({ k: lastItem.updatedAt.toISOString(), id: lastItem.id })
            : null,
      };
      if (useCache) await cache.setFirstPage(userId, response);
      return response;
    },
    async getBoard(userId, boardId): Promise<BoardSummary> {
      const board = await repository.getBoardForMember(boardId, userId);
      if (!board) throw boardNotFound();
      return toBoardSummary(board);
    },
    async updateBoard(userId, boardId, input): Promise<BoardSummary> {
      const role = await repository.findMembershipRole(boardId, userId);
      if (!role) throw boardNotFound();
      if (role !== "ADMIN") {
        throw new HttpError(403, "BOARD_ADMIN_REQUIRED", "Administrator access is required.");
      }
      const result = await repository.updateBoardForAdmin(boardId, userId, input);
      if (result.kind === "NOT_FOUND") throw boardNotFound();
      if (result.kind === "FORBIDDEN") {
        throw new HttpError(403, "BOARD_ADMIN_REQUIRED", "Administrator access is required.");
      }
      if (result.kind === "VERSION_CONFLICT") {
        throw new HttpError(
          409,
          "BOARD_VERSION_CONFLICT",
          "The board was changed by someone else.",
        );
      }
      await cache.invalidateForUsers(result.memberIds);
      return toBoardSummary(result.board);
    },
    async listMembers(userId, boardId, query): Promise<BoardMemberListResponse> {
      const role = await repository.findMembershipRole(boardId, userId);
      if (!role) throw boardNotFound();
      const cursor = cursorFor(query.cursor);
      if (query.cursor !== undefined && !cursor)
        throw new HttpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
      const page = await repository.listMembers(boardId, userId, {
        cursorKey: cursor?.k,
        cursorId: cursor?.id,
        limit: query.limit,
      });
      const lastItem = page.items.at(-1);
      return {
        items: page.items.map(toBoardMember),
        nextCursor:
          page.hasMore && lastItem
            ? encodeCursor({ k: lastItem.joinedAt.toISOString(), id: lastItem.membershipId })
            : null,
      };
    },
  };
}
