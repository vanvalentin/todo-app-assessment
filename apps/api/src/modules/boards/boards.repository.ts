import type { PrismaClient } from "@prisma/client";
import type { BoardRole, CreateBoardRequest } from "@ksat/contracts";
import { generateUuid } from "../../auth/identity.js";
import type {
  BoardMemberRow,
  BoardWithRole,
  BoardsRepository,
  UpdateBoardResult,
  MemberPreview,
  Page,
} from "./boards.types.js";
import type { UpdateBoardRequest } from "@ksat/contracts";
const MEMBER_PREVIEW_LIMIT = 4;
const previewSelect = { id: true, name: true, avatarSeed: true } as const;
function previewsByBoard(
  rows: readonly { boardId: string; user: { id: string; name: string; avatarSeed: string } }[],
): Map<string, MemberPreview[]> {
  const byBoard = new Map<string, MemberPreview[]>();
  for (const row of rows) {
    const list = byBoard.get(row.boardId) ?? [];
    if (list.length < MEMBER_PREVIEW_LIMIT) list.push(row.user);
    byBoard.set(row.boardId, list);
  }
  return byBoard;
}
function cursorFilter(page: {
  cursorKey?: string | undefined;
  cursorId?: string | undefined;
}): Record<string, unknown> {
  if (page.cursorKey === undefined || page.cursorId === undefined) return {};
  return {
    OR: [
      { updatedAt: { lt: new Date(page.cursorKey) } },
      { updatedAt: new Date(page.cursorKey), id: { lt: page.cursorId } },
    ],
  };
}
export function createPrismaBoardsRepository(prisma: PrismaClient): BoardsRepository {
  return {
    async createBoardForOwner(userId: string, input: CreateBoardRequest): Promise<BoardWithRole> {
      const board = await prisma.board.create({
        data: {
          id: generateUuid(),
          name: input.name,
          description: input.description,
          ownerId: userId,
          memberships: {
            create: { id: generateUuid(), userId, role: "ADMIN" },
          },
        },
        include: { owner: { select: previewSelect } },
      });
      return {
        id: board.id,
        name: board.name,
        description: board.description,
        ownerId: board.ownerId,
        role: "ADMIN",
        memberCount: 1,
        memberPreview: [board.owner],
        version: board.version,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
      };
    },
    async findMembershipRole(boardId, userId): Promise<BoardRole | null> {
      const membership = await prisma.boardMembership.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { role: true },
      });
      return membership?.role ?? null;
    },
    async updateBoardForAdmin(
      boardId: string,
      userId: string,
      input: UpdateBoardRequest,
    ): Promise<UpdateBoardResult> {
      return prisma.$transaction(async (transaction): Promise<UpdateBoardResult> => {
        const updated = await transaction.board.updateMany({
          where: {
            id: boardId,
            version: input.version,
            memberships: { some: { userId, role: "ADMIN" } },
          },
          data: { name: input.name, description: input.description, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          const membership = await transaction.boardMembership.findUnique({
            where: { boardId_userId: { boardId, userId } },
            select: { role: true },
          });
          if (!membership) return { kind: "NOT_FOUND" };
          return membership.role === "ADMIN" ? { kind: "VERSION_CONFLICT" } : { kind: "FORBIDDEN" };
        }

        const board = await transaction.board.findUnique({
          where: { id: boardId },
          include: { memberships: { where: { userId }, select: { role: true } } },
        });
        const currentMembership = board?.memberships.at(0);
        if (!board || !currentMembership) return { kind: "NOT_FOUND" };
        const [memberCount, previewRows, memberRows] = await Promise.all([
          transaction.boardMembership.count({ where: { boardId } }),
          transaction.boardMembership.findMany({
            where: { boardId },
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            take: MEMBER_PREVIEW_LIMIT,
            select: { user: { select: previewSelect } },
          }),
          transaction.boardMembership.findMany({
            where: { boardId },
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            select: { userId: true },
          }),
        ]);
        return {
          kind: "UPDATED",
          board: {
            id: board.id,
            name: board.name,
            description: board.description,
            ownerId: board.ownerId,
            role: currentMembership.role as BoardRole,
            memberCount,
            memberPreview: previewRows.map((row) => row.user),
            version: board.version,
            createdAt: board.createdAt,
            updatedAt: board.updatedAt,
          },
          memberIds: memberRows.map((row) => row.userId),
        };
      });
    },
    async listBoardsForMember(userId, page): Promise<Page<BoardWithRole>> {
      const boards = await prisma.board.findMany({
        where: { memberships: { some: { userId } }, ...cursorFilter(page) },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
      });
      const hasMore = boards.length > page.limit;
      const pageRows = hasMore ? boards.slice(0, page.limit) : boards;
      const boardIds = pageRows.map((board) => board.id);
      if (boardIds.length === 0) return { items: [], hasMore: false };
      const [roles, counts, previewRows] = await Promise.all([
        prisma.boardMembership.findMany({
          where: { boardId: { in: boardIds }, userId },
          select: { boardId: true, role: true },
        }),
        prisma.boardMembership.groupBy({
          by: ["boardId"],
          where: { boardId: { in: boardIds } },
          _count: { _all: true },
        }),
        prisma.boardMembership.findMany({
          where: { boardId: { in: boardIds } },
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          select: { boardId: true, user: { select: previewSelect } },
        }),
      ]);
      const roleByBoard = new Map(roles.map((row) => [row.boardId, row.role as BoardRole]));
      const countByBoard = new Map(counts.map((row) => [row.boardId, row._count._all]));
      const previewByBoard = previewsByBoard(previewRows);
      return {
        items: pageRows.map((board) => ({
          id: board.id,
          name: board.name,
          description: board.description,
          ownerId: board.ownerId,
          role: roleByBoard.get(board.id) ?? "CONTRIBUTOR",
          memberCount: countByBoard.get(board.id) ?? 0,
          memberPreview: previewByBoard.get(board.id) ?? [],
          version: board.version,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
        })),
        hasMore,
      };
    },
    async getBoardForMember(boardId, userId): Promise<BoardWithRole | null> {
      const board = await prisma.board.findFirst({
        where: { id: boardId, memberships: { some: { userId } } },
        include: { memberships: { where: { userId }, select: { role: true } } },
      });
      if (!board) return null;
      const membership = board.memberships[0];
      if (!membership) return null;
      const [memberCount, previewRows] = await Promise.all([
        prisma.boardMembership.count({ where: { boardId: board.id } }),
        prisma.boardMembership.findMany({
          where: { boardId: board.id },
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          take: MEMBER_PREVIEW_LIMIT,
          select: { user: { select: previewSelect } },
        }),
      ]);
      return {
        id: board.id,
        name: board.name,
        description: board.description,
        ownerId: board.ownerId,
        role: membership.role,
        memberCount,
        memberPreview: previewRows.map((row) => row.user),
        version: board.version,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
      };
    },
    async listMembers(boardId, userId, page): Promise<Page<BoardMemberRow>> {
      const rows = await prisma.boardMembership.findMany({
        where: {
          boardId,
          board: { memberships: { some: { userId } } },
          ...(page.cursorKey !== undefined && page.cursorId !== undefined
            ? {
                OR: [
                  { joinedAt: { lt: new Date(page.cursorKey) } },
                  { joinedAt: new Date(page.cursorKey), id: { lt: page.cursorId } },
                ],
              }
            : {}),
        },
        orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
        include: { user: { select: { id: true, name: true, avatarSeed: true, email: true } } },
      });
      const hasMore = rows.length > page.limit;
      const pageRows = hasMore ? rows.slice(0, page.limit) : rows;
      return {
        items: pageRows.map((row) => ({
          userId: row.userId,
          boardId: row.boardId,
          role: row.role,
          joinedAt: row.joinedAt,
          membershipId: row.id,
          user: row.user,
        })),
        hasMore,
      };
    },
  };
}
