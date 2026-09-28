import { Prisma, type PrismaClient } from "@prisma/client";
import type { BoardRole, TaskPriority, TaskSort, TaskStatus } from "@ksat/contracts";
import { generateUuid } from "../../auth/identity.js";
import { nextOccurrence, occurrenceDueDate } from "./recurrence.js";
import type {
  CreateTaskResult,
  DeleteTaskResult,
  TaskListFilters,
  TaskPage,
  TaskPageRequest,
  TaskReferenceRow,
  TaskRow,
  TasksRepository,
  TaskWriteInput,
  UpdateTaskResult,
} from "./tasks.types.js";

const personPreview = { id: true, name: true, avatarSeed: true } as const;
const withPeople = {
  createdBy: { select: personPreview },
  assignee: { select: personPreview },
  dependencies: {
    where: { dependsOn: { deletedAt: null } },
    select: { dependsOn: { select: { id: true, sequence: true, name: true, status: true } } },
    orderBy: { dependsOn: { sequence: "asc" } },
  },
  schedule: {
    select: {
      id: true,
      rrule: true,
      timezone: true,
      startLocal: true,
      nextRunAt: true,
      enabled: true,
    },
  },
  generatedOccurrence: {
    select: {
      id: true,
      scheduledAt: true,
      generatedTaskId: true,
      schedule: { select: { taskId: true } },
    },
  },
} as const;
const WRITE_CONFLICT_RETRIES = 5;
const activeTaskPredicate = { deletedAt: null } as const;

/**
 * Statuses a dependent may move into only once every prerequisite has settled.
 * NOT_STARTED and ARCHIVED stay outside the gate: a task can still be parked or set
 * aside while a prerequisite is open.
 */
const GATED_MOVE_TARGETS: readonly TaskStatus[] = ["IN_PROGRESS", "COMPLETED"];

interface TaskWithPeople {
  readonly id: string;
  readonly boardId: string;
  readonly sequence: number;
  readonly name: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: Date | null;
  readonly dependencies: ReadonlyArray<{ readonly dependsOn: TaskReferenceRow }>;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: { readonly id: string; readonly name: string; readonly avatarSeed: string };
  readonly assignee: {
    readonly id: string;
    readonly name: string;
    readonly avatarSeed: string;
  } | null;
  readonly schedule: {
    readonly id: string;
    readonly rrule: string;
    readonly timezone: string;
    readonly startLocal: string;
    readonly nextRunAt: Date | null;
    readonly enabled: boolean;
  } | null;
  readonly generatedOccurrence: {
    readonly id: string;
    readonly scheduledAt: Date;
    readonly generatedTaskId: string | null;
    readonly schedule: { readonly taskId: string | null };
  } | null;
}

function toTaskRow(row: TaskWithPeople): TaskRow {
  return {
    id: row.id,
    boardId: row.boardId,
    sequence: row.sequence,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dependsOn: row.dependencies.map((edge) => edge.dependsOn),
    assignee: row.assignee,
    dueDate: row.dueDate,
    createdBy: row.createdBy,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    recurrence: {
      schedule: row.schedule
        ? {
            id: row.schedule.id,
            rrule: row.schedule.rrule,
            timezone: row.schedule.timezone,
            startLocal: row.schedule.startLocal,
            nextRunAt: row.schedule.nextRunAt?.toISOString() ?? null,
            enabled: row.schedule.enabled,
          }
        : null,
      occurrence: row.generatedOccurrence
        ? {
            id: row.generatedOccurrence.id,
            scheduledAt: row.generatedOccurrence.scheduledAt.toISOString(),
            templateTaskId: row.generatedOccurrence.schedule.taskId,
            generatedTaskId: row.generatedOccurrence.generatedTaskId,
          }
        : null,
    },
  };
}

/** `YYYY-MM-DD` stored as a raw calendar date; parsed at UTC midnight so it round-trips exactly. */
function dueDateToColumn(dueDate: string | null): Date | null {
  return dueDate === null ? null : new Date(`${dueDate}T00:00:00.000Z`);
}

/**
 * PostgreSQL's LIKE/ILIKE default escape character is the backslash even without an
 * explicit ESCAPE clause, so escaping it plus the two wildcard characters here keeps
 * a search term literal through Prisma's generated `contains` predicate.
 */
function escapeLikePattern(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function memberScope(userId: string): { board: { memberships: { some: { userId: string } } } } {
  return { board: { memberships: { some: { userId } } } };
}

/** Builds the WHERE clause for every board-list filter except pagination. */
function filtersWhere(boardId: string, userId: string, filters: TaskListFilters): object {
  const clauses: object[] = [
    { boardId },
    { deletedAt: null },
    memberScope(userId),
    { status: { in: filters.statuses } },
  ];
  if (filters.blocking === "BLOCKED") {
    clauses.push({
      dependencies: {
        some: {
          dependsOn: { deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
        },
      },
    });
  } else if (filters.blocking === "UNBLOCKED") {
    clauses.push({
      NOT: {
        dependencies: {
          some: {
            dependsOn: { deletedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
          },
        },
      },
    });
  }
  if (filters.priority !== undefined) clauses.push({ priority: filters.priority });
  if (filters.assigneeId === null) clauses.push({ assigneeId: null });
  else if (filters.assigneeId !== undefined) clauses.push({ assigneeId: filters.assigneeId });
  if (filters.due !== undefined) {
    if (filters.due.kind === "NONE") clauses.push({ dueDate: null });
    else if (filters.due.kind === "OVERDUE") {
      clauses.push({ dueDate: { lt: filters.due.today, not: null } });
    } else if (filters.due.kind === "TODAY") clauses.push({ dueDate: filters.due.today });
    else if (filters.due.kind === "NEXT_7_DAYS") {
      clauses.push({ dueDate: { gte: filters.due.from, lte: filters.due.to } });
    }
  }
  if (filters.search !== undefined) {
    const nameClause = {
      name: { contains: escapeLikePattern(filters.search.name), mode: "insensitive" as const },
    };
    clauses.push(
      filters.search.sequence === null
        ? nameClause
        : { OR: [nameClause, { sequence: filters.search.sequence }] },
    );
  }
  return { AND: clauses };
}

/** The keyset "after" clause for the requested sort; `{}` for a first page (no cursor). */
function cursorWhere(sort: TaskSort, cursor: TaskPageRequest["cursor"]): object {
  if (!cursor) return {};
  const { key, sequence } = cursor;
  switch (sort) {
    case "DUE_DATE": {
      if (key === null) return { dueDate: null, sequence: { gt: sequence } };
      const date = dueDateToColumn(key);
      return {
        OR: [
          { dueDate: { gt: date } },
          { dueDate: date, sequence: { gt: sequence } },
          { dueDate: null },
        ],
      };
    }
    case "PRIORITY":
      return {
        OR: [
          { priority: { lt: key as TaskPriority } },
          { priority: key as TaskPriority, sequence: { gt: sequence } },
        ],
      };
    case "NEWEST":
      return {
        OR: [
          { createdAt: { lt: new Date(key as string) } },
          { createdAt: new Date(key as string), sequence: { gt: sequence } },
        ],
      };
    case "OLDEST":
      return {
        OR: [
          { createdAt: { gt: new Date(key as string) } },
          { createdAt: new Date(key as string), sequence: { gt: sequence } },
        ],
      };
    case "NAME":
      return {
        OR: [{ name: { gt: key as string } }, { name: key as string, sequence: { gt: sequence } }],
      };
  }
}

function orderByFor(sort: TaskSort): object[] {
  switch (sort) {
    case "DUE_DATE":
      return [{ dueDate: { sort: "asc", nulls: "last" } }, { sequence: "asc" }];
    case "PRIORITY":
      return [{ priority: "desc" }, { sequence: "asc" }];
    case "NEWEST":
      return [{ createdAt: "desc" }, { sequence: "asc" }];
    case "OLDEST":
      return [{ createdAt: "asc" }, { sequence: "asc" }];
    case "NAME":
      return [{ name: "asc" }, { sequence: "asc" }];
  }
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
 * write: the composite assignee foreign key is the real backstop, so a foreign-key
 * violation on one of them is mapped to the same result the pre-check would have
 * returned, never a raw 500.
 */
function membershipViolationKind(
  error: unknown,
): "ASSIGNEE_NOT_MEMBER" | "DEPENDENCY_NOT_FOUND" | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003") {
    return null;
  }
  const meta = error.meta as { constraint?: unknown; field_name?: unknown } | undefined;
  const constraint = String(meta?.constraint ?? meta?.field_name ?? "");
  // A prerequisite deleted between the in-transaction check and the edge insert.
  if (constraint.includes("task_dependency") || constraint.includes("dependsOnTaskId")) {
    return "DEPENDENCY_NOT_FOUND";
  }
  if (constraint.includes("assignee")) return "ASSIGNEE_NOT_MEMBER";
  return null;
}

export function createPrismaTasksRepository(prisma: PrismaClient): TasksRepository {
  /** Membership pre-checks inside the write transaction; NOT_FOUND/board id is the caller's job. */
  async function checkPeopleMembership(
    tx: Prisma.TransactionClient,
    boardId: string,
    input: TaskWriteInput,
  ): Promise<"ASSIGNEE_NOT_MEMBER" | null> {
    if (input.assigneeId !== null) {
      const assignee = await tx.boardMembership.findUnique({
        where: { boardId_userId: { boardId, userId: input.assigneeId } },
        select: { userId: true },
      });
      if (!assignee) return "ASSIGNEE_NOT_MEMBER";
    }
    return null;
  }

  /** Every requested prerequisite must be a task on this same board. */
  async function dependenciesExist(
    tx: Prisma.TransactionClient,
    boardId: string,
    dependsOnIds: readonly string[],
  ): Promise<boolean> {
    if (dependsOnIds.length === 0) return true;
    const found = await tx.task.count({ where: { boardId, id: { in: [...dependsOnIds] } } });
    return found === dependsOnIds.length;
  }

  /**
   * An unfinished prerequisite blocks a move into In Progress or Completed. ARCHIVED
   * counts as settled: the domain maps the prototype's "Canceled" control onto that
   * status, so cancelled work will never complete, and keeping it blocking would
   * dead-end every dependent until its edge was deleted. The edge is kept, so the
   * chip still shows that the prerequisite was archived rather than finished.
   */
  async function dependenciesAreSettled(
    tx: Prisma.TransactionClient,
    boardId: string,
    dependsOnIds: readonly string[],
  ): Promise<boolean> {
    if (dependsOnIds.length === 0) return true;
    const blocking = await tx.task.count({
      where: {
        boardId,
        deletedAt: null,
        id: { in: [...dependsOnIds] },
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      },
    });
    return blocking === 0;
  }

  /**
   * Serializes dependency-graph writes per board. Two concurrent edits that each add
   * one half of a cycle (A -> B and B -> A) would both pass a READ COMMITTED check;
   * holding the board row lock until commit makes the second one see the first edge.
   */
  async function lockBoardGraph(tx: Prisma.TransactionClient, boardId: string): Promise<void> {
    await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "board" WHERE "id" = ${boardId} FOR UPDATE`;
  }

  /** True when any new prerequisite already (transitively) depends on the task itself. */
  async function wouldCreateCycle(
    tx: Prisma.TransactionClient,
    boardId: string,
    taskId: string,
    newDependsOnIds: readonly string[],
  ): Promise<boolean> {
    const edges = await tx.taskDependency.findMany({
      where: { boardId },
      select: { taskId: true, dependsOnTaskId: true },
    });
    const next = new Map<string, string[]>();
    for (const edge of edges)
      next.set(edge.taskId, [...(next.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
    const pending = [...newDependsOnIds];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const currentId = pending.pop();
      if (currentId === undefined || visited.has(currentId)) continue;
      if (currentId === taskId) return true;
      visited.add(currentId);
      pending.push(...(next.get(currentId) ?? []));
    }
    return false;
  }
  async function generateNextOccurrenceOnCompletion(
    tx: Prisma.TransactionClient,
    taskId: string,
    now: Date,
  ): Promise<void> {
    const schedule = await tx.taskSchedule.findFirst({
      where: { enabled: true, taskId },
      include: {
        occurrences: {
          where: { generatedTaskId: taskId },
          select: { scheduledAt: true },
          take: 1,
        },
      },
    });
    if (!schedule) return;
    const currentTask = await tx.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        boardId: true,
        name: true,
        description: true,
        priority: true,
        assigneeId: true,
        createdById: true,
      },
    });
    if (!currentTask) return;

    const currentScheduledAt = schedule.occurrences[0]?.scheduledAt ?? schedule.nextRunAt;
    if (!currentScheduledAt) return;
    const anchor = new Date(Math.max(currentScheduledAt.getTime(), now.getTime()));
    const scheduledAt =
      schedule.occurrences.length > 0
        ? nextOccurrence(schedule, anchor)
        : currentScheduledAt.getTime() > now.getTime()
          ? currentScheduledAt
          : nextOccurrence(schedule, anchor);
    if (!scheduledAt) {
      await tx.taskSchedule.update({
        where: { id: schedule.id },
        data: { enabled: false, nextRunAt: null },
      });
      return;
    }

    const board = await tx.board.update({
      where: { id: currentTask.boardId },
      data: { nextTaskSequence: { increment: 1 } },
      select: { nextTaskSequence: true },
    });
    const generatedTaskId = generateUuid();
    await tx.task.create({
      data: {
        id: generatedTaskId,
        boardId: currentTask.boardId,
        sequence: board.nextTaskSequence - 1,
        name: currentTask.name,
        description: currentTask.description,
        status: "NOT_STARTED",
        priority: currentTask.priority,
        assigneeId: currentTask.assigneeId,
        dueDate: occurrenceDueDate(scheduledAt, schedule.timezone),
        createdById: currentTask.createdById,
      },
      select: { id: true },
    });
    await tx.scheduleOccurrence.create({
      data: {
        id: generateUuid(),
        scheduleId: schedule.id,
        scheduledAt,
        generatedTaskId,
      },
    });
    const nextRunAt = nextOccurrence(schedule, scheduledAt);
    // The recurrence belongs to the current occurrence, not permanently to the first task.
    // Moving it in the same transaction lets the new task continue the series even when
    // any older occurrence (including the original task) is later soft-deleted.
    await tx.taskSchedule.update({
      where: { id: schedule.id },
      data: nextRunAt
        ? { taskId: generatedTaskId, nextRunAt }
        : { taskId: generatedTaskId, nextRunAt: null, enabled: false },
    });
  }

  return {
    async findMembershipRole(boardId, userId): Promise<BoardRole | null> {
      const row = await prisma.boardMembership.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { role: true },
      });
      return row?.role ?? null;
    },

    async listForMember(boardId, userId, filters, page): Promise<TaskPage> {
      const rows = await prisma.task.findMany({
        where: {
          AND: [filtersWhere(boardId, userId, filters), cursorWhere(page.sort, page.cursor)],
        },
        orderBy: orderByFor(page.sort),
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
          if (input.schedule && input.dueDate === null) {
            return { kind: "SCHEDULE_DUE_DATE_REQUIRED" } as const;
          }

          const violation = await checkPeopleMembership(tx, boardId, input);
          if (violation) return { kind: violation } as const;
          if (!(await dependenciesExist(tx, boardId, input.dependsOnIds))) {
            return { kind: "DEPENDENCY_NOT_FOUND" } as const;
          }
          if (
            GATED_MOVE_TARGETS.includes(input.status) &&
            !(await dependenciesAreSettled(tx, boardId, input.dependsOnIds))
          ) {
            return { kind: "DEPENDENCIES_INCOMPLETE" } as const;
          }

          // A brand-new task has no dependents, so its edges can never close a cycle.
          // The board row lock serializes concurrent creation at READ COMMITTED, so each
          // transaction reads the previous value and the sequence has no duplicates or gaps.
          const board = await tx.board.update({
            where: { id: boardId },
            data: { nextTaskSequence: { increment: 1 } },
            select: { nextTaskSequence: true },
          });
          try {
            const taskId = generateUuid();
            await tx.task.create({
              data: {
                id: taskId,
                boardId,
                sequence: board.nextTaskSequence - 1,
                name: input.name,
                description: input.description,
                status: input.status,
                priority: input.priority,
                assigneeId: input.assigneeId,
                dueDate: dueDateToColumn(input.dueDate),
                createdById: userId,
              },
              select: { id: true },
            });
            if (input.dependsOnIds.length > 0) {
              await tx.taskDependency.createMany({
                data: input.dependsOnIds.map((dependsOnTaskId) => ({
                  boardId,
                  taskId,
                  dependsOnTaskId,
                })),
              });
            }
            if (input.schedule) {
              await tx.taskSchedule.create({
                data: {
                  id: input.schedule.id ?? generateUuid(),
                  taskId,
                  rrule: input.schedule.rrule,
                  timezone: input.schedule.timezone,
                  startLocal: input.schedule.startLocal,
                  nextRunAt: input.schedule.nextRunAt,
                  enabled: input.schedule.enabled,
                },
              });
            }
            const task = await tx.task.findUniqueOrThrow({
              where: { id: taskId },
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
        where: { id: taskId, deletedAt: null, ...memberScope(userId) },
        include: withPeople,
      });
      return row === null ? null : toTaskRow(row);
    },

    async updateForMember(taskId, userId, input): Promise<UpdateTaskResult> {
      return retryOnWriteConflict(() =>
        prisma.$transaction(async (tx) => {
          const existing = await tx.task.findFirst({
            where: { id: taskId, deletedAt: null, ...memberScope(userId) },
            select: {
              boardId: true,
              status: true,
              schedule: { select: { id: true } },
              dependencies: { select: { dependsOnTaskId: true } },
            },
          });
          if (!existing) return { kind: "NOT_FOUND" } as const;
          const { boardId } = existing;
          const keepsSchedule =
            input.schedule !== null && (input.schedule !== undefined || existing.schedule !== null);
          if (keepsSchedule && input.dueDate === null) {
            return { kind: "SCHEDULE_DUE_DATE_REQUIRED" } as const;
          }

          const violation = await checkPeopleMembership(tx, boardId, input);
          if (violation) return { kind: violation } as const;
          if (!(await dependenciesExist(tx, boardId, input.dependsOnIds))) {
            return { kind: "DEPENDENCY_NOT_FOUND" } as const;
          }
          const current = new Set(existing.dependencies.map((edge) => edge.dependsOnTaskId));
          const desired = new Set(input.dependsOnIds);
          const added = input.dependsOnIds.filter((id) => !current.has(id));
          const removed = [...current].filter((id) => !desired.has(id));
          // The cycle check runs before the status gate. A loop can never be satisfied, so
          // naming it is more useful than complaining about prerequisites the caller would
          // be unable to complete. Only a new edge can close a cycle.
          if (added.length > 0) {
            await lockBoardGraph(tx, boardId);
            if (await wouldCreateCycle(tx, boardId, taskId, added)) {
              return { kind: "DEPENDENCY_CYCLE" } as const;
            }
          }

          // Only a move into a gated status is checked. Re-saving a task whose status is
          // unchanged must stay possible even when an upstream prerequisite drifted back,
          // otherwise a rule about moving would block unrelated edits.
          const movingIntoGatedStatus =
            input.status !== existing.status && GATED_MOVE_TARGETS.includes(input.status);
          if (
            movingIntoGatedStatus &&
            !(await dependenciesAreSettled(tx, boardId, input.dependsOnIds))
          ) {
            return { kind: "DEPENDENCIES_INCOMPLETE" } as const;
          }

          let updated: { count: number };
          try {
            updated = await tx.task.updateMany({
              where: {
                id: taskId,
                version: input.version,
                ...activeTaskPredicate,
                ...memberScope(userId),
              },
              data: {
                name: input.name,
                description: input.description,
                status: input.status,
                priority: input.priority,
                assigneeId: input.assigneeId,
                dueDate: dueDateToColumn(input.dueDate),
                version: { increment: 1 },
              },
            });
            // Edges change only after the version predicate won, so a stale edit
            // never rewrites the dependency set.
            if (updated.count === 1 && removed.length > 0) {
              await tx.taskDependency.deleteMany({
                where: { taskId, dependsOnTaskId: { in: removed } },
              });
            }
            if (updated.count === 1 && added.length > 0) {
              await tx.taskDependency.createMany({
                data: added.map((dependsOnTaskId) => ({ boardId, taskId, dependsOnTaskId })),
              });
            }
          } catch (error) {
            const kind = membershipViolationKind(error);
            if (kind) return { kind } as const;
            throw error;
          }
          if (updated.count === 1) {
            if (input.schedule !== undefined) {
              if (input.schedule === null) {
                await tx.taskSchedule.updateMany({
                  where: { taskId },
                  data: { taskId: null, enabled: false, nextRunAt: null },
                });
              } else {
                await tx.taskSchedule.upsert({
                  where: { taskId },
                  create: {
                    id: input.schedule.id ?? generateUuid(),
                    taskId,
                    rrule: input.schedule.rrule,
                    timezone: input.schedule.timezone,
                    startLocal: input.schedule.startLocal,
                    nextRunAt: input.schedule.nextRunAt,
                    enabled: input.schedule.enabled,
                  },
                  update: {
                    rrule: input.schedule.rrule,
                    timezone: input.schedule.timezone,
                    startLocal: input.schedule.startLocal,
                    nextRunAt: input.schedule.nextRunAt,
                    enabled: input.schedule.enabled,
                  },
                });
              }
            }
            if (input.status === "ARCHIVED") {
              await tx.taskSchedule.updateMany({
                where: { taskId },
                data: { enabled: false, nextRunAt: null },
              });
            }
            if (input.status === "COMPLETED" && existing.status !== "COMPLETED") {
              await generateNextOccurrenceOnCompletion(tx, taskId, new Date());
            }
            const row = await tx.task.findFirst({
              where: { id: taskId, deletedAt: null, ...memberScope(userId) },
              include: withPeople,
            });
            if (row) return { kind: "UPDATED", task: toTaskRow(row) } as const;
          }
          // A zero-row write is either a stale version or a task the caller cannot see.
          const stillVisible = await tx.task.findFirst({
            where: { id: taskId, ...activeTaskPredicate, ...memberScope(userId) },
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
        return prisma.$transaction(async (tx) => {
          const visible = await tx.task.findFirst({
            where: { id: taskId, version, deletedAt: null, ...memberScope(userId) },
            select: { id: true },
          });
          if (!visible) {
            const stillVisible = await tx.task.findFirst({
              where: { id: taskId, deletedAt: null, ...memberScope(userId) },
              select: { id: true },
            });
            return stillVisible ? ("VERSION_CONFLICT" as const) : ("NOT_FOUND" as const);
          }
          await tx.task.update({
            where: { id: taskId },
            data: { deletedAt: new Date(), version: { increment: 1 } },
          });
          return "DELETED" as const;
        });
      });
    },
  };
}
