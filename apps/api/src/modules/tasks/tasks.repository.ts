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
  TaskWriteInput,
  UpdateTaskResult,
} from "./tasks.types.js";

const personPreview = { id: true, name: true, avatarSeed: true } as const;
const withPeople = {
  createdBy: { select: personPreview },
  assignee: { select: personPreview },
  reporter: { select: personPreview },
} as const;
const WRITE_CONFLICT_RETRIES = 5;

interface TaskWithPeople {
  readonly id: string;
  readonly boardId: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: { readonly id: string; readonly name: string; readonly avatarSeed: string };
  readonly assignee: {
    readonly id: string;
    readonly name: string;
    readonly avatarSeed: string;
  } | null;
  readonly reporter: { readonly id: string; readonly name: string; readonly avatarSeed: string };
}

function toTaskRow(row: TaskWithPeople): TaskRow {
  return {
    id: row.id,
    boardId: row.boardId,
    sequence: row.sequence,
    name: row.name,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    reporter: row.reporter,
    dueDate: row.dueDate,
    createdBy: row.createdBy,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** `YYYY-MM-DD` stored as a raw calendar date; parsed at UTC midnight so it round-trips exactly. */
function dueDateToColumn(dueDate: string | null): Date | null {
  return dueDate === null ? null : new Date(`${dueDate}T00:00:00.000Z`);
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

/**
 * Defense in depth against the same-transaction membership check racing a concurrent
 * write: the composite foreign keys (task_assignee_board_membership_fkey,
 * task_reporter_board_membership_fkey) are the real backstop, so a foreign-key
 * violation on one of them is mapped to the same result the pre-check would have
 * returned, never a raw 500.
 */
function membershipViolationKind(
  error: unknown,
): "ASSIGNEE_NOT_MEMBER" | "REPORTER_NOT_MEMBER" | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003") {
    return null;
  }
  const meta = error.meta as { constraint?: unknown; field_name?: unknown } | undefined;
  const constraint = String(meta?.constraint ?? meta?.field_name ?? "");
  if (constraint.includes("assignee")) return "ASSIGNEE_NOT_MEMBER";
  if (constraint.includes("reporter")) return "REPORTER_NOT_MEMBER";
  return null;
}

export function createPrismaTasksRepository(prisma: PrismaClient): TasksRepository {
  async function existsForMember(taskId: string, userId: string): Promise<boolean> {
    const row = await prisma.task.findFirst({
      where: { id: taskId, ...memberScope(userId) },
      select: { id: true },
    });
    return row !== null;
  }

  /** Membership pre-checks inside the write transaction; NOT_FOUND/board id is the caller's job. */
  async function checkPeopleMembership(
    tx: Prisma.TransactionClient,
    boardId: string,
    input: TaskWriteInput,
  ): Promise<"ASSIGNEE_NOT_MEMBER" | "REPORTER_NOT_MEMBER" | null> {
    if (input.assigneeId !== null) {
      const assignee = await tx.boardMembership.findUnique({
        where: { boardId_userId: { boardId, userId: input.assigneeId } },
        select: { userId: true },
      });
      if (!assignee) return "ASSIGNEE_NOT_MEMBER";
    }
    const reporter = await tx.boardMembership.findUnique({
      where: { boardId_userId: { boardId, userId: input.reporterId } },
      select: { userId: true },
    });
    if (!reporter) return "REPORTER_NOT_MEMBER";
    return null;
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
        include: withPeople,
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

          const violation = await checkPeopleMembership(tx, boardId, input);
          if (violation) return { kind: violation } as const;

          // The board row lock serializes concurrent creation at READ COMMITTED, so each
          // transaction reads the previous value and the sequence has no duplicates or gaps.
          const board = await tx.board.update({
            where: { id: boardId },
            data: { nextTaskSequence: { increment: 1 } },
            select: { nextTaskSequence: true },
          });
          try {
            const task = await tx.task.create({
              data: {
                id: generateUuid(),
                boardId,
                sequence: board.nextTaskSequence - 1,
                name: input.name,
                status: input.status,
                priority: input.priority,
                assigneeId: input.assigneeId,
                reporterId: input.reporterId,
                dueDate: dueDateToColumn(input.dueDate),
                createdById: userId,
              },
              include: withPeople,
            });
            return { kind: "CREATED", task: toTaskRow(task) } as const;
          } catch (error) {
            const kind = membershipViolationKind(error);
            if (kind) return { kind } as const;
            throw error;
          }
        }),
      );
    },

    async getForMember(taskId, userId): Promise<TaskRow | null> {
      const row = await prisma.task.findFirst({
        where: { id: taskId, ...memberScope(userId) },
        include: withPeople,
      });
      return row === null ? null : toTaskRow(row);
    },

    async updateForMember(taskId, userId, input): Promise<UpdateTaskResult> {
      return retryOnWriteConflict(() =>
        prisma.$transaction(async (tx) => {
          const existing = await tx.task.findFirst({
            where: { id: taskId, ...memberScope(userId) },
            select: { boardId: true },
          });
          if (!existing) return { kind: "NOT_FOUND" } as const;

          const violation = await checkPeopleMembership(tx, existing.boardId, input);
          if (violation) return { kind: violation } as const;

          let updated: { count: number };
          try {
            updated = await tx.task.updateMany({
              where: { id: taskId, version: input.version, ...memberScope(userId) },
              data: {
                name: input.name,
                status: input.status,
                priority: input.priority,
                assigneeId: input.assigneeId,
                reporterId: input.reporterId,
                dueDate: dueDateToColumn(input.dueDate),
                version: { increment: 1 },
              },
            });
          } catch (error) {
            const kind = membershipViolationKind(error);
            if (kind) return { kind } as const;
            throw error;
          }
          if (updated.count === 1) {
            const row = await tx.task.findFirst({
              where: { id: taskId, ...memberScope(userId) },
              include: withPeople,
            });
            if (row) return { kind: "UPDATED", task: toTaskRow(row) } as const;
          }
          // A zero-row write is either a stale version or a task the caller cannot see.
          const stillVisible = await tx.task.findFirst({
            where: { id: taskId, ...memberScope(userId) },
            select: { id: true },
          });
          return stillVisible
            ? ({ kind: "VERSION_CONFLICT" } as const)
            : ({ kind: "NOT_FOUND" } as const);
        }),
      );
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
