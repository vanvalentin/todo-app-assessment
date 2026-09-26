import type { ActiveTaskStatus, Task, TaskPriority, TaskStatus } from "@ksat/contracts";
import { ApiError, NetworkError, UnexpectedResponseError } from "../../lib/api/client";

export interface TaskColumnDefinition {
  readonly status: ActiveTaskStatus;
  readonly title: string;
  readonly stage: string;
  readonly tone: "neutral" | "progress" | "complete";
}

/** The three active columns of the board; ARCHIVED is owned by the archive slice. */
export const TASK_COLUMNS: readonly TaskColumnDefinition[] = [
  { status: "NOT_STARTED", title: "Not Started", stage: "STAGE 01", tone: "neutral" },
  { status: "IN_PROGRESS", title: "In Progress", stage: "STAGE 02", tone: "progress" },
  { status: "COMPLETED", title: "Completed", stage: "DONE", tone: "complete" },
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  HIGH: "High Priority",
  MEDIUM: "Medium Priority",
  LOW: "Low Priority",
};

export function isActiveStatus(status: TaskStatus): status is ActiveTaskStatus {
  return status !== "ARCHIVED";
}

export function columnTitle(status: ActiveTaskStatus): string {
  return TASK_COLUMNS.find((column) => column.status === status)?.title ?? status;
}

function bySequence(left: Task, right: Task): number {
  return left.sequence - right.sequence;
}

/** Groups loaded tasks into the three columns in board sequence order. */
export function groupTasksByStatus(tasks: readonly Task[]): Record<ActiveTaskStatus, Task[]> {
  const grouped: Record<ActiveTaskStatus, Task[]> = {
    NOT_STARTED: [],
    IN_PROGRESS: [],
    COMPLETED: [],
  };
  for (const task of tasks) {
    if (!isActiveStatus(task.status)) continue;
    grouped[task.status].push(task);
  }
  for (const status of Object.keys(grouped) as ActiveTaskStatus[]) {
    grouped[status].sort(bySequence);
  }
  return grouped;
}

export function taskBoardErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn’t reach Ksat. Check your connection and try again.";
  }
  if (error instanceof UnexpectedResponseError) {
    return "The task board came back in an unexpected shape. Please retry.";
  }
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 404) return "This board does not exist, or you are not a member of it.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return "We couldn’t load this board. Please retry.";
}

export function taskMutationErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn’t reach Ksat. Your change was not saved.";
  }
  if (error instanceof ApiError) {
    if (error.code === "TASK_VERSION_CONFLICT") {
      return "Someone else changed this task first. The board now shows their version.";
    }
    if (error.status === 403) return "You don’t have permission to change tasks on this board.";
    if (error.status === 404) return "This task is no longer available to you.";
    if (error.status === 429) return "Too many changes at once. Please wait a moment and retry.";
  }
  return "We couldn’t save that change. The board shows the last saved state.";
}
