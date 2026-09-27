import type {
  ActiveTaskStatus,
  CreateTaskRequest,
  Task,
  TaskDueFilter,
  TaskListResponse,
  TaskPriority,
  TaskSort,
  TaskStatus,
  UpdateTaskRequest,
} from "@ksat/contracts";
import { HttpError } from "../../errors.js";
import {
  decodeTaskCursor,
  encodeTaskCursor,
  taskCursorSortMismatch,
} from "../../lib/taskCursor.js";
import type {
  ResolvedDueFilter,
  TaskListFilters,
  TaskRow,
  TasksRepository,
} from "./tasks.types.js";

export const DEFAULT_TASK_PAGE_LIMIT = 50;
const ACTIVE_STATUSES: readonly ActiveTaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
const NEXT_7_DAYS_SPAN_MS = 6 * 24 * 60 * 60 * 1000;

export interface TaskPageQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly sort?: TaskSort;
  readonly q?: string;
  readonly assignee?: string;
  readonly priority?: TaskPriority;
  readonly status?: ActiveTaskStatus;
  readonly includeArchived?: boolean;
  readonly due?: TaskDueFilter;
  readonly today?: string;
}

export interface TasksServiceDeps {
  readonly repository: TasksRepository;
}

/**
 * Task rules for the Kanban slice. Every active board member, including
 * CONTRIBUTOR, may manage tasks and may set any active member as assignee or
 * reporter; only membership itself is required, and the repository enforces it
 * inside each transaction rather than trusting the caller. Search, filter, sort,
 * and archive visibility (phase 4c) are resolved here before reaching the
 * repository, which stays a thin, filter-shaped Prisma query.
 */
export interface TasksService {
  listTasks(userId: string, boardId: string, query: TaskPageQuery): Promise<TaskListResponse>;
  createTask(userId: string, boardId: string, input: CreateTaskRequest): Promise<Task>;
  getTask(userId: string, taskId: string): Promise<Task>;
  updateTask(userId: string, taskId: string, input: UpdateTaskRequest): Promise<Task>;
  deleteTask(userId: string, taskId: string, version: number): Promise<void>;
}

/** A stored calendar date is UTC midnight; slicing its ISO string keeps it a plain date. */
function formatDueDate(dueDate: Date | null): string | null {
  return dueDate === null ? null : dueDate.toISOString().slice(0, 10);
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    boardId: row.boardId,
    sequence: row.sequence,
    name: row.name,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    reporter: row.reporter,
    dueDate: formatDueDate(row.dueDate),
    createdBy: row.createdBy,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function boardNotFound(): HttpError {
  return new HttpError(404, "BOARD_NOT_FOUND", "The board was not found.");
}

function taskNotFound(): HttpError {
  return new HttpError(404, "TASK_NOT_FOUND", "The task was not found.");
}

function taskVersionConflict(): HttpError {
  return new HttpError(409, "TASK_VERSION_CONFLICT", "The task was changed by someone else.");
}

function assigneeNotMember(): HttpError {
  return new HttpError(
    422,
    "TASK_ASSIGNEE_NOT_MEMBER",
    "The assignee must be an active member of this board.",
  );
}

function reporterNotMember(): HttpError {
  return new HttpError(
    422,
    "TASK_REPORTER_NOT_MEMBER",
    "The reporter must be an active member of this board.",
  );
}

function invalidCursor(): HttpError {
  return new HttpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
}

/** A UTC-midnight Date for a `YYYY-MM-DD` string, matching how due dates are stored. */
function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Resolves the archive toggle and any status filter into the final status set. */
function resolveStatuses(
  status: ActiveTaskStatus | undefined,
  includeArchived: boolean,
): TaskStatus[] {
  const active: TaskStatus[] = status ? [status] : [...ACTIVE_STATUSES];
  return includeArchived ? [...active, "ARCHIVED"] : active;
}

/** Resolves the due-date bucket against the viewer's own local calendar day. */
function resolveDueFilter(
  due: TaskDueFilter | undefined,
  today: string | undefined,
): ResolvedDueFilter | undefined {
  if (due === undefined) return undefined;
  if (due === "NONE") return { kind: "NONE" };
  // The contract's refinement guarantees "today" is present for every other bucket.
  const todayDate = calendarDate(today as string);
  if (due === "OVERDUE") return { kind: "OVERDUE", today: todayDate };
  if (due === "TODAY") return { kind: "TODAY", today: todayDate };
  return {
    kind: "NEXT_7_DAYS",
    from: todayDate,
    to: new Date(todayDate.getTime() + NEXT_7_DAYS_SPAN_MS),
  };
}

/** Parses a "#12" or "12" search term into an exact sequence candidate. */
function parseSequenceCandidate(term: string): number | null {
  const match = /^#?(\d{1,9})$/.exec(term);
  return match ? Number(match[1]) : null;
}

function resolveFilters(query: TaskPageQuery): TaskListFilters {
  const due = resolveDueFilter(query.due, query.today);
  return {
    statuses: resolveStatuses(query.status, query.includeArchived ?? false),
    ...(query.assignee !== undefined
      ? { assigneeId: query.assignee === "none" ? null : query.assignee }
      : {}),
    ...(query.priority !== undefined ? { priority: query.priority } : {}),
    ...(due !== undefined ? { due } : {}),
    ...(query.q !== undefined
      ? { search: { name: query.q, sequence: parseSequenceCandidate(query.q) } }
      : {}),
  };
}

/** Derives the opaque keyset value for a row under the given sort, mirroring the repository's cursor logic. */
function sortKeyOf(row: TaskRow, sort: TaskSort): string | null {
  switch (sort) {
    case "DUE_DATE":
      return formatDueDate(row.dueDate);
    case "PRIORITY":
      return row.priority;
    case "NEWEST":
    case "OLDEST":
      return row.createdAt.toISOString();
    case "NAME":
      return row.name;
  }
}

export function createTasksService({ repository }: TasksServiceDeps): TasksService {
  return {
    async listTasks(userId, boardId, query): Promise<TaskListResponse> {
      const role = await repository.findMembershipRole(boardId, userId);
      if (!role) throw boardNotFound();
      const sort = query.sort ?? "DUE_DATE";
      const cursor = query.cursor === undefined ? undefined : decodeTaskCursor(query.cursor);
      if (query.cursor !== undefined && !cursor) throw invalidCursor();
      if (cursor && taskCursorSortMismatch(cursor, sort)) throw invalidCursor();

      const page = await repository.listForMember(boardId, userId, resolveFilters(query), {
        sort,
        limit: query.limit,
        ...(cursor ? { cursor: { key: cursor.k, sequence: cursor.n } } : {}),
      });
      const lastItem = page.items.at(-1);
      return {
        items: page.items.map(toTask),
        nextCursor:
          page.hasMore && lastItem
            ? encodeTaskCursor({ s: sort, k: sortKeyOf(lastItem, sort), n: lastItem.sequence })
            : null,
      };
    },

    async createTask(userId, boardId, input): Promise<Task> {
      const result = await repository.createForMember(boardId, userId, {
        name: input.name,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        // Omitted defaults to the caller; any active member may be named instead.
        reporterId: input.reporterId ?? userId,
        dueDate: input.dueDate,
      });
      if (result.kind === "NOT_FOUND") throw boardNotFound();
      if (result.kind === "ASSIGNEE_NOT_MEMBER") throw assigneeNotMember();
      if (result.kind === "REPORTER_NOT_MEMBER") throw reporterNotMember();
      return toTask(result.task);
    },

    async getTask(userId, taskId): Promise<Task> {
      const row = await repository.getForMember(taskId, userId);
      if (!row) throw taskNotFound();
      return toTask(row);
    },

    async updateTask(userId, taskId, input): Promise<Task> {
      const result = await repository.updateForMember(taskId, userId, {
        name: input.name,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        reporterId: input.reporterId,
        dueDate: input.dueDate,
        version: input.version,
      });
      if (result.kind === "NOT_FOUND") throw taskNotFound();
      if (result.kind === "VERSION_CONFLICT") throw taskVersionConflict();
      if (result.kind === "ASSIGNEE_NOT_MEMBER") throw assigneeNotMember();
      if (result.kind === "REPORTER_NOT_MEMBER") throw reporterNotMember();
      return toTask(result.task);
    },

    async deleteTask(userId, taskId, version): Promise<void> {
      const result = await repository.deleteForMember(taskId, userId, version);
      if (result === "NOT_FOUND") throw taskNotFound();
      if (result === "VERSION_CONFLICT") throw taskVersionConflict();
    },
  };
}
