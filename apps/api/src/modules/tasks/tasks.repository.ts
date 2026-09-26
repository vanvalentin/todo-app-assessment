import { Prisma, type PrismaClient } from "@prisma/client";
import type { BoardRole, TaskPriority, TaskStatus } from "@ksat/contracts";
import { generateUuid } from "../../auth/identity.js";
import type {
  CreateTaskResult,
  DeleteTaskResult,
  TaskPage,
  TaskPageRequest,
  TaskRow,
  TasksRepository,
  UpdateTaskResult,
} from "./tasks.types.js";

const creatorPreview = { id: true, name: true, avatarSeed: true } as const;
const withCreator = { createdBy: { select: creatorPreview } } as const;
const WRITE_CONFLICT_RETRIES = 5;

interface TaskWithCreator {
  readonly id: string;
  readonly boardId: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: { readonly id: string; readonly name: string; readonly avatarSeed: string };
}

function toTaskRow(row: TaskWithCreator): TaskRow {
  return {
    id: row.id,
    boardId: row.boardId,
    sequence: row.sequence,
    name: row.name,
    status: row.status,
    priority: row.priority,
    createdBy: row.createdBy,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The candidate sort order is (createdAt, id), so the cursor is a strict "after" key. */
function cursorWhere(page: TaskPageRequest): Record<string, unknown> {
  if (page.cursorKey === undefined || page.cursorId === undefined) return {};
  return {
    OR: [
      { createdAt: { gt: new Date(page.cursorKey) } },
      { createdAt: new Date(page.cursorKey), id: { gt: page.cursorId } },
    ],
  };
}

function memberScope(userId: string): { board: { memberships: { some: { userId: string } } } } {
  return { board: { memberships: { some: { userId } } } };
}

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** Retries are safe here: every write is version- or sequence-predicated and idempotent. */
async function retryOnWriteConflict<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (isWriteConflict(error) && attempt < WRITE_CONFLICT_RETRIES) continue;
      throw error;
    }
  }
}

export function createPrismaTasksRepository(prisma: PrismaClient): TasksRepository {
  async function existsForMember(taskId: string, userId: string): Promise<boolean> {
    const row = await prisma.task.findFirst({
      where: { id: taskId, ...memberScope(userId) },
      select: { id: true },
    });
    return row !== null;
  }

  return {
    async findMembershipRole(boardId, userId): Promise<BoardRole | null> {
      const row = await prisma.boardMembership.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { role: true },
      });
      return row?.role ?? null;
    },

    async listActiveForMember(boardId, userId, page): Promise<TaskPage> {
      const rows = await prisma.task.findMany({
        where: {
          boardId,
          // The archive slice owns ARCHIVED visibility; it is never part of a board read here.
          status: { not: "ARCHIVED" },
          ...memberScope(userId),
          ...cursorWhere(page),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: page.limit + 1,
        include: withCreator,
      });
      const hasMore = rows.length > page.limit;
      const pageRows = hasMore ? rows.slice(0, page.limit) : rows;
      return { items: pageRows.map(toTaskRow), hasMore };
    },

    async createForMember(boardId, userId, input): Promise<CreateTaskResult> {
      return retryOnWriteConflict(() =>
        prisma.$transaction(async (tx) => {
          const membership = await tx.boardMembership.findUnique({
            where: { boardId_userId: { boardId, userId } },
            select: { userId: true },
          });
          if (!membership) return { kind: "NOT_FOUND" } as const;
          // The board row lock serializes concurrent creation at READ COMMITTED, so each
          // transaction reads the previous value and the sequence has no duplicates or gaps.
          const board = await tx.board.update({
            where: { id: boardId },
            data: { nextTaskSequence: { increment: 1 } },
            select: { nextTaskSequence: true },
          });
          const task = await tx.task.create({
            data: {
              id: generateUuid(),
              boardId,
              sequence: board.nextTaskSequence - 1,
              name: input.name,
              status: input.status,
              priority: input.priority,
              createdById: userId,
            },
            include: withCreator,
          });
          return { kind: "CREATED", task: toTaskRow(task) } as const;
        }),
      );
    },

    async getForMember(taskId, userId): Promise<TaskRow | null> {
      const row = await prisma.task.findFirst({
        where: { id: taskId, ...memberScope(userId) },
        include: withCreator,
      });
      return row === null ? null : toTaskRow(row);
    },

    async updateForMember(taskId, userId, input): Promise<UpdateTaskResult> {
      return retryOnWriteConflict(async () => {
        const updated = await prisma.task.updateMany({
          where: { id: taskId, version: input.version, ...memberScope(userId) },
          data: {
            name: input.name,
            status: input.status,
            priority: input.priority,
            version: { increment: 1 },
          },
        });
        if (updated.count === 1) {
          const row = await prisma.task.findFirst({
            where: { id: taskId, ...memberScope(userId) },
            include: withCreator,
          });
          if (row) return { kind: "UPDATED", task: toTaskRow(row) } as const;
        }
        // A zero-row write is either a stale version or a task the caller cannot see.
        return (await existsForMember(taskId, userId))
          ? ({ kind: "VERSION_CONFLICT" } as const)
          : ({ kind: "NOT_FOUND" } as const);
      });
    },

    async deleteForMember(taskId, userId, version): Promise<DeleteTaskResult> {
      return retryOnWriteConflict(async () => {
        const deleted = await prisma.task.deleteMany({
          where: { id: taskId, version, ...memberScope(userId) },
        });
        if (deleted.count === 1) return "DELETED" as const;
        return (await existsForMember(taskId, userId))
          ? ("VERSION_CONFLICT" as const)
          : ("NOT_FOUND" as const);
      });
    },
  };
}
