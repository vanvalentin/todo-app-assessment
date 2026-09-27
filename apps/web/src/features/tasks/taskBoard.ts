import type {
  ActiveTaskStatus,
  TaskBlockingFilter,
  Task,
  TaskDueFilter,
  TaskPriority,
  TaskStatus,
} from "@ksat/contracts";
import { ApiError, NetworkError, UnexpectedResponseError } from "../../lib/api/client";

export interface TaskColumnDefinition {
  readonly status: TaskStatus;
  readonly title: string;
  readonly stage: string;
  readonly tone: "neutral" | "progress" | "complete" | "archived";
}

/** The three active columns of the board; ARCHIVED joins only when the toggle is on. */
export const TASK_COLUMNS: readonly TaskColumnDefinition[] = [
  { status: "NOT_STARTED", title: "Not Started", stage: "STAGE 01", tone: "neutral" },
  { status: "IN_PROGRESS", title: "In Progress", stage: "STAGE 02", tone: "progress" },
  { status: "COMPLETED", title: "Completed", stage: "DONE", tone: "complete" },
];

export const ARCHIVE_COLUMN: TaskColumnDefinition = {
  status: "ARCHIVED",
  title: "Archived",
  stage: "ARCHIVE",
  tone: "archived",
};

/** The board's visible columns: the three active ones, plus Archived when shown. */
export function visibleColumns(includeArchived: boolean): readonly TaskColumnDefinition[] {
  return includeArchived ? [...TASK_COLUMNS, ARCHIVE_COLUMN] : TASK_COLUMNS;
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  HIGH: "High Priority",
  MEDIUM: "Medium Priority",
  LOW: "Low Priority",
};

export function isActiveStatus(status: TaskStatus): status is ActiveTaskStatus {
  return status !== "ARCHIVED";
}

export function columnTitle(status: TaskStatus): string {
  if (status === "ARCHIVED") return ARCHIVE_COLUMN.title;
  return TASK_COLUMNS.find((column) => column.status === status)?.title ?? status;
}

/**
 * Groups loaded tasks into their columns. Tasks arrive already sorted by the
 * server's requested sort, so grouping is a stable partition and never re-sorts.
 */
export function groupTasksByStatus(tasks: readonly Task[]): Record<TaskStatus, Task[]> {
  const grouped: Record<TaskStatus, Task[]> = {
    NOT_STARTED: [],
    IN_PROGRESS: [],
    COMPLETED: [],
    ARCHIVED: [],
  };
  for (const task of tasks) {
    grouped[task.status].push(task);
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

export type DueTone = "upcoming" | "today" | "overdue";

export interface DueDateInfo {
  readonly label: string;
  readonly badge: string;
  readonly tone: DueTone;
}

/** Whole days between two `YYYY-MM-DD` calendar dates, both compared at UTC midnight. */
function daysBetween(dueDate: string, today: string): number {
  const [dy, dm, dd] = dueDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const dueMs = Date.UTC(dy, dm - 1, dd);
  const todayMs = Date.UTC(ty, tm - 1, td);
  return Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000));
}

/** `YYYY-MM-DD` for the viewer's own local calendar day. */
export function localToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Formats a due date for display; overdue/due-today are marked with text, not colour alone. */
export function describeDueDate(
  dueDate: string | null,
  now: Date = new Date(),
): DueDateInfo | null {
  if (dueDate === null) return null;
  const label = new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const diff = daysBetween(dueDate, localToday(now));
  if (diff < 0) {
    return { label, badge: `${Math.abs(diff)}d overdue`, tone: "overdue" };
  }
  if (diff === 0) {
    return { label, badge: "Due today", tone: "today" };
  }
  return { label, badge: `${diff}d left`, tone: "upcoming" };
}

/** Whether a due date falls into the requested bucket, matching the API's own resolution. */
export function dueDateMatchesFilter(
  dueDate: string | null,
  due: TaskDueFilter,
  today: string,
): boolean {
  if (due === "NONE") return dueDate === null;
  if (dueDate === null) return false;
  const diff = daysBetween(dueDate, today);
  if (due === "OVERDUE") return diff < 0;
  if (due === "TODAY") return diff === 0;
  // NEXT_7_DAYS spans today..today+6 inclusive, matching the API's own bucket.
  return diff >= 0 && diff <= 6;
}

/** The board-list filters as resolved for an API request; mirrors the URL-backed state. */
export interface TaskBoardFilterState {
  readonly q?: string;
  /** A member id, "none" for unassigned, or undefined for no filter. */
  readonly assignee?: string;
  readonly priority?: TaskPriority;
  readonly status?: ActiveTaskStatus;
  readonly blocking?: TaskBlockingFilter;
  readonly includeArchived: boolean;
  readonly due?: TaskDueFilter;
  readonly today?: string;
}

/** Parses a "#12" or "12" search term into an exact sequence candidate. */
function parseSequenceCandidate(term: string): number | null {
  const match = /^#?(\d{1,9})$/.exec(term.trim());
  return match ? Number(match[1]) : null;
}

/**
 * True if a task would appear under the given board filters. Used to decide whether
 * an optimistic edit should keep, insert into, or drop a task from a cached view
 * without waiting for the server to confirm.
 */
export function matchesTaskFilters(task: Task, filters: TaskBoardFilterState): boolean {
  if (!filters.includeArchived && task.status === "ARCHIVED") return false;
  if (filters.status !== undefined && task.status !== filters.status) return false;
  if (filters.priority !== undefined && task.priority !== filters.priority) return false;
  const isBlocked = task.dependsOn.some(
    (dependency) => dependency.status === "NOT_STARTED" || dependency.status === "IN_PROGRESS",
  );
  if (filters.blocking === "BLOCKED" && !isBlocked) return false;
  if (filters.blocking === "UNBLOCKED" && isBlocked) return false;
  if (filters.assignee !== undefined) {
    if (filters.assignee === "none") {
      if (task.assignee !== null) return false;
    } else if (task.assignee?.id !== filters.assignee) {
      return false;
    }
  }
  if (filters.due !== undefined && filters.today !== undefined) {
    if (!dueDateMatchesFilter(task.dueDate, filters.due, filters.today)) return false;
  }
  if (filters.q !== undefined && filters.q.trim() !== "") {
    const term = filters.q.trim().toLowerCase();
    const sequenceCandidate = parseSequenceCandidate(term);
    const matchesName = task.name.toLowerCase().includes(term);
    const matchesSequence = sequenceCandidate !== null && task.sequence === sequenceCandidate;
    if (!matchesName && !matchesSequence) return false;
  }
  return true;
}

/** Field-level copy for the dependency 422s, or null for any other code. */
export function dependencyErrorMessage(code: string | undefined): string | null {
  if (code === "TASK_DEPENDENCY_CYCLE") {
    return "That dependency would create a loop: the chosen task already depends on this one.";
  }
  if (code === "TASK_DEPENDENCY_SELF") return "A task can’t depend on itself.";
  if (code === "TASK_DEPENDENCY_NOT_FOUND") {
    return "One of the chosen dependencies is no longer on this board.";
  }
  if (code === "TASK_DEPENDENCIES_INCOMPLETE") {
    return "Complete all dependencies before moving this task to In Progress or Completed.";
  }
  return null;
}

export function taskMutationErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn’t reach Ksat. Your change was not saved.";
  }
  if (error instanceof ApiError) {
    if (error.code === "TASK_VERSION_CONFLICT") {
      return "Someone else changed this task first. Reload the latest values before saving again.";
    }
    if (error.code === "TASK_ASSIGNEE_NOT_MEMBER") {
      return "That assignee is no longer a member of this board.";
    }
    const dependencyMessage = dependencyErrorMessage(error.code);
    if (dependencyMessage !== null) return dependencyMessage;
    if (error.status === 403) return "You don’t have permission to change tasks on this board.";
    if (error.status === 404) return "This task is no longer available to you.";
    if (error.status === 429) return "Too many changes at once. Please wait a moment and retry.";
  }
  return "We couldn’t save that change. The board shows the last saved state.";
}
