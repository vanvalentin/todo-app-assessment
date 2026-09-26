import {
  createTaskRequestSchema,
  taskListResponseSchema,
  taskSchema,
  updateTaskRequestSchema,
  type CreateTaskRequestInput,
  type UpdateTaskRequest,
} from "@ksat/contracts";
import { apiRequest, apiRequestNoContent } from "./client";

/** The API caps a page at 100 items; a board asks for a full first page. */
const MAX_PAGE_SIZE = 100;

function pageQuery(cursor: string | null | undefined): string {
  const params = new URLSearchParams();
  if (cursor !== undefined && cursor !== null) params.set("cursor", cursor);
  params.set("limit", String(MAX_PAGE_SIZE));
  return `?${params.toString()}`;
}

export function fetchBoardTasks(
  boardId: string,
  options: { cursor?: string | null; signal?: AbortSignal } = {},
) {
  return apiRequest(
    `/api/v1/boards/${encodeURIComponent(boardId)}/tasks${pageQuery(options.cursor)}`,
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

export function updateTask(taskId: string, input: UpdateTaskRequest) {
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
