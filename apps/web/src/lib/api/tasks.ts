import {
  createTaskRequestSchema,
  taskListResponseSchema,
  taskSchema,
  updateTaskRequestSchema,
  type ActiveTaskStatus,
  type TaskBlockingFilter,
  type CreateTaskRequestInput,
  type TaskDueFilter,
  type TaskPriority,
  type TaskSort,
  type UpdateTaskRequestInput,
} from "@ksat/contracts";
import { apiRequest, apiRequestNoContent } from "./client";

/** The API caps a page at 100 items; a board asks for a full first page. */
const MAX_PAGE_SIZE = 100;

/**
 * The board-list search/filter/sort/archive parameters, resolved from URL state.
 * Shaped after the shared `taskListQuerySchema`, minus pagination (handled here).
 */
export interface TaskListFilterParams {
  readonly q?: string;
  /** A member id, or "none" for unassigned. */
  readonly assignee?: string;
  readonly priority?: TaskPriority;
  readonly status?: ActiveTaskStatus;
  readonly blocking?: TaskBlockingFilter;
  readonly includeArchived?: boolean;
  readonly due?: TaskDueFilter;
  /** The viewer's local calendar day; required only alongside `due`. */
  readonly today?: string;
  readonly sort?: TaskSort;
}

function taskListQuery(filters: TaskListFilterParams, cursor: string | null | undefined): string {
  const params = new URLSearchParams();
  if (filters.q !== undefined && filters.q !== "") params.set("q", filters.q);
  if (filters.assignee !== undefined) params.set("assignee", filters.assignee);
  if (filters.priority !== undefined) params.set("priority", filters.priority);
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.blocking !== undefined) params.set("blocking", filters.blocking);
  if (filters.includeArchived === true) params.set("includeArchived", "true");
  if (filters.due !== undefined) params.set("due", filters.due);
  if (filters.today !== undefined) params.set("today", filters.today);
  if (filters.sort !== undefined) params.set("sort", filters.sort);
  if (cursor !== undefined && cursor !== null) params.set("cursor", cursor);
  params.set("limit", String(MAX_PAGE_SIZE));
  return `?${params.toString()}`;
}

export function fetchBoardTasks(
  boardId: string,
  filters: TaskListFilterParams,
  options: { cursor?: string | null; signal?: AbortSignal } = {},
) {
  return apiRequest(
    `/api/v1/boards/${encodeURIComponent(boardId)}/tasks${taskListQuery(filters, options.cursor)}`,
    taskListResponseSchema,
    { signal: options.signal },
  );
}

export function createTask(boardId: string, input: CreateTaskRequestInput) {
  return apiRequest(`/api/v1/boards/${encodeURIComponent(boardId)}/tasks`, taskSchema, {
    method: "POST",
    body: createTaskRequestSchema.parse(input),
  });
}

export function fetchTask(taskId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/tasks/${encodeURIComponent(taskId)}`, taskSchema, { signal });
}

export function updateTask(taskId: string, input: UpdateTaskRequestInput) {
  return apiRequest(`/api/v1/tasks/${encodeURIComponent(taskId)}`, taskSchema, {
    method: "PATCH",
    body: updateTaskRequestSchema.parse(input),
  });
}

/** Deletion sends the expected version so a stale removal cannot win. */
export function deleteTask(taskId: string, version: number) {
  const params = new URLSearchParams({ version: String(version) });
  return apiRequestNoContent(`/api/v1/tasks/${encodeURIComponent(taskId)}?${params.toString()}`, {
    method: "DELETE",
  });
}
