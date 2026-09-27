import {
  activeTaskStatusSchema,
  taskDueFilterSchema,
  taskPrioritySchema,
  taskSortSchema,
  type ActiveTaskStatus,
  type TaskDueFilter,
  type TaskPriority,
  type TaskSort,
} from "@ksat/contracts";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { TaskListFilterParams } from "../../lib/api/tasks";
import { localToday } from "./taskBoard";

const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_SORT: TaskSort = "DUE_DATE";

function validated<T extends string>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  raw: string | null,
): T | undefined {
  if (raw === null) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export interface TaskBoardSearchState {
  /** Immediate value for the controlled search input; debounced into the URL. */
  readonly searchInput: string;
  readonly assignee: string;
  readonly priority: TaskPriority | "";
  readonly status: ActiveTaskStatus | "";
  readonly due: TaskDueFilter | "";
  readonly sort: TaskSort;
  readonly includeArchived: boolean;
  readonly hasActiveFilters: boolean;
  /** The resolved filters ready to send to the API, "me" already substituted. */
  readonly filters: TaskListFilterParams;
  setSearchInput(value: string): void;
  setAssignee(value: string): void;
  setPriority(value: TaskPriority | ""): void;
  setStatus(value: ActiveTaskStatus | ""): void;
  setDue(value: TaskDueFilter | ""): void;
  setSort(value: TaskSort): void;
  toggleArchived(): void;
  clearFilters(): void;
}

/**
 * Search, filter, sort, and archive-visibility state, held entirely in the URL so a
 * board view is linkable and survives a reload. Invalid or unknown values (a stale
 * link, a hand-edited URL) are dropped rather than sent to the API.
 */
export function useTaskBoardSearch(currentUserId: string | null): TaskBoardSearchState {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [searchInput, setSearchInputState] = useState(q);
  const debounceRef = useRef<number | null>(null);
  const skipNextSyncRef = useRef(false);

  const assignee = searchParams.get("assignee") ?? "";
  const priority = validated<TaskPriority>(taskPrioritySchema, searchParams.get("priority")) ?? "";
  const status =
    validated<ActiveTaskStatus>(activeTaskStatusSchema, searchParams.get("status")) ?? "";
  const due = validated<TaskDueFilter>(taskDueFilterSchema, searchParams.get("due")) ?? "";
  const sort = validated<TaskSort>(taskSortSchema, searchParams.get("sort")) ?? DEFAULT_SORT;
  const includeArchived = searchParams.get("archived") === "1";

  function updateParams(update: Record<string, string | null>, replace: boolean): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(update)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace },
    );
  }

  // Debounce typing into the URL; keep the visible input responsive either way.
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      skipNextSyncRef.current = true;
      updateParams({ q: searchInput.trim() === "" ? null : searchInput.trim() }, true);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Keep the input in sync with external navigation (back/forward, cleared filters),
  // but not with the debounce's own write, which would otherwise fight the caret.
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    setSearchInputState(q);
  }, [q]);

  const resolvedAssignee =
    assignee === "me" ? (currentUserId ?? undefined) : assignee === "" ? undefined : assignee;

  const filters: TaskListFilterParams = {
    ...(q !== "" ? { q } : {}),
    ...(resolvedAssignee !== undefined ? { assignee: resolvedAssignee } : {}),
    ...(priority !== "" ? { priority } : {}),
    ...(status !== "" ? { status } : {}),
    includeArchived,
    ...(due !== "" ? { due, today: localToday() } : {}),
    sort,
  };

  const hasActiveFilters =
    q !== "" ||
    assignee !== "" ||
    priority !== "" ||
    status !== "" ||
    due !== "" ||
    includeArchived ||
    sort !== DEFAULT_SORT;

  return {
    searchInput,
    assignee,
    priority,
    status,
    due,
    sort,
    includeArchived,
    hasActiveFilters,
    filters,
    setSearchInput: setSearchInputState,
    setAssignee: (value) => updateParams({ assignee: value === "" ? null : value }, false),
    setPriority: (value) => updateParams({ priority: value === "" ? null : value }, false),
    setStatus: (value) => updateParams({ status: value === "" ? null : value }, false),
    setDue: (value) => updateParams({ due: value === "" ? null : value }, false),
    setSort: (value) => updateParams({ sort: value === DEFAULT_SORT ? null : value }, false),
    toggleArchived: () => updateParams({ archived: includeArchived ? null : "1" }, false),
    clearFilters: () => {
      skipNextSyncRef.current = true;
      setSearchInputState("");
      setSearchParams(new URLSearchParams(), { replace: false });
    },
  };
}
