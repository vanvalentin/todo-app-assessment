import type { CreateTaskRequest, Task, TaskListResponse, UpdateTaskRequest } from "@ksat/contracts";
import { HttpError } from "../../errors.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import type { TaskRow, TasksRepository } from "./tasks.types.js";

export const DEFAULT_TASK_PAGE_LIMIT = 50;

export interface TaskPageQuery {
  readonly cursor?: string;
  readonly limit: number;
}

export interface TasksServiceDeps {
  readonly repository: TasksRepository;
}

/**
 * Task rules for the Kanban slice. Every active board member, including
 * CONTRIBUTOR, may manage tasks; only membership itself is required, and the
 * repository enforces it inside each query rather than trusting the caller.
 */
export interface TasksService {
  listTasks(userId: string, boardId: string, query: TaskPageQuery): Promise<TaskListResponse>;
  createTask(userId: string, boardId: string, input: CreateTaskRequest): Promise<Task>;
  getTask(userId: string, taskId: string): Promise<Task>;
  updateTask(userId: string, taskId: string, input: UpdateTaskRequest): Promise<Task>;
  deleteTask(userId: string, taskId: string, version: number): Promise<void>;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    boardId: row.boardId,
    sequence: row.sequence,
    name: row.name,
    status: row.status,
    priority: row.priority,
    createdBy: {
      id: row.createdBy.id,
      name: row.createdBy.name,
      avatarSeed: row.createdBy.avatarSeed,
    },
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

export function createTasksService({ repository }: TasksServiceDeps): TasksService {
  return {
    async listTasks(userId, boardId, query): Promise<TaskListResponse> {
      const role = await repository.findMembershipRole(boardId, userId);
      if (!role) throw boardNotFound();
      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      if (query.cursor !== undefined && !cursor) {
        throw new HttpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
      }
      const page = await repository.listActiveForMember(boardId, userId, {
        cursorKey: cursor?.k,
        cursorId: cursor?.id,
        limit: query.limit,
      });
      const lastItem = page.items.at(-1);
      return {
        items: page.items.map(toTask),
        nextCursor:
          page.hasMore && lastItem
            ? encodeCursor({ k: lastItem.createdAt.toISOString(), id: lastItem.id })
            : null,
      };
    },

    async createTask(userId, boardId, input): Promise<Task> {
      const result = await repository.createForMember(boardId, userId, input);
      if (result.kind === "NOT_FOUND") throw boardNotFound();
      return toTask(result.task);
    },

    async getTask(userId, taskId): Promise<Task> {
      const row = await repository.getForMember(taskId, userId);
      if (!row) throw taskNotFound();
      return toTask(row);
    },

    async updateTask(userId, taskId, input): Promise<Task> {
      const result = await repository.updateForMember(taskId, userId, input);
      if (result.kind === "NOT_FOUND") throw taskNotFound();
      if (result.kind === "VERSION_CONFLICT") throw taskVersionConflict();
      return toTask(result.task);
    },

    async deleteTask(userId, taskId, version): Promise<void> {
      const result = await repository.deleteForMember(taskId, userId, version);
      if (result === "NOT_FOUND") throw taskNotFound();
      if (result === "VERSION_CONFLICT") throw taskVersionConflict();
    },
  };
}
