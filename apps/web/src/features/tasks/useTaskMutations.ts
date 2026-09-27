import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  CreateTaskRequestInput,
  Task,
  TaskListResponse,
  TaskPriority,
  TaskStatus,
  UserPreview,
} from "@ksat/contracts";
import type { TaskListFilterParams } from "../../lib/api/tasks";
import { queryKeys } from "../../lib/api/queryKeys";
import { createTask, deleteTask, updateTask } from "../../lib/api/tasks";
import { matchesTaskFilters, type TaskBoardFilterState } from "./taskBoard";

type TasksData = InfiniteData<TaskListResponse, string | null>;

export interface TaskEditValues {
  readonly task: Task;
  readonly name: string;
  /** The full status enum: an edit or a drag onto the Archived column may archive or restore. */
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  /** The full preview, not just an id, so the optimistic cache can render it immediately. */
  readonly assignee: UserPreview | null;
  readonly reporter: UserPreview;
  readonly dueDate: string | null;
}

interface Snapshot {
  readonly entries: ReadonlyArray<{
    readonly queryKey: QueryKey;
    readonly previous: TasksData | undefined;
  }>;
}

function toFilterState(filters: TaskListFilterParams): TaskBoardFilterState {
  return {
    ...(filters.q !== undefined ? { q: filters.q } : {}),
    ...(filters.assignee !== undefined ? { assignee: filters.assignee } : {}),
    ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
    ...(filters.status !== undefined ? { status: filters.status } : {}),
    includeArchived: filters.includeArchived ?? false,
    ...(filters.due !== undefined ? { due: filters.due } : {}),
    ...(filters.today !== undefined ? { today: filters.today } : {}),
  };
}

/**
 * Applies the updater to every cached task-list page for this board, across every
 * filtered view currently in the cache (not only the one on screen), and returns a
 * snapshot of each so a failed mutation can restore them exactly.
 */
function forEachTasksQuery(
  queryClient: QueryClient,
  boardId: string,
  updater: (data: TasksData | undefined, filters: TaskListFilterParams) => TasksData | undefined,
): Snapshot {
  const matches = queryClient.getQueriesData<TasksData>({
    queryKey: queryKeys.boardTasksAll(boardId),
  });
  const entries = matches.map(([queryKey, data]) => {
    const filters = (queryKey[3] as TaskListFilterParams | undefined) ?? { includeArchived: false };
    queryClient.setQueryData<TasksData>(queryKey, updater(data, filters));
    return { queryKey, previous: data };
  });
  return { entries };
}

function restoreSnapshot(queryClient: QueryClient, snapshot: Snapshot): void {
  for (const entry of snapshot.entries) {
    queryClient.setQueryData(entry.queryKey, entry.previous);
  }
}

/** Replaces or removes a task in place; never repositions it (settle-time refetch reconciles order). */
function reconcileTask(
  data: TasksData | undefined,
  filters: TaskListFilterParams,
  updated: Task,
): TasksData | undefined {
  if (data === undefined) return data;
  const stillMatches = matchesTaskFilters(updated, toFilterState(filters));
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.flatMap((item) => {
        if (item.id !== updated.id) return [item];
        return stillMatches ? [updated] : [];
      }),
    })),
  };
}

function dropTask(data: TasksData | undefined, taskId: string): TasksData | undefined {
  if (data === undefined) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== taskId),
    })),
  };
}

/**
 * Task mutations with optimistic cache edits. Creation is a plain invalidation across
 * every cached filtered view; editing, moving, archiving, and deleting apply the
 * change immediately to every cached view, restore the exact snapshot when the
 * request fails, and always reconcile with the server afterwards, so a `409`
 * conflict leaves the authoritative version on screen.
 */
export function useTaskMutations(boardId: string) {
  const queryClient = useQueryClient();
  const tasksAllKey = queryKeys.boardTasksAll(boardId);

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskRequestInput) => createTask(boardId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksAllKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ task, name, status, priority, assignee, reporter, dueDate }: TaskEditValues) =>
      updateTask(task.id, {
        name,
        status,
        priority,
        assigneeId: assignee?.id ?? null,
        reporterId: reporter.id,
        dueDate,
        version: task.version,
      }),
    onMutate: async (values: TaskEditValues): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: tasksAllKey });
      const updated: Task = {
        ...values.task,
        name: values.name,
        status: values.status,
        priority: values.priority,
        assignee: values.assignee,
        reporter: values.reporter,
        dueDate: values.dueDate,
      };
      return forEachTasksQuery(queryClient, boardId, (data, filters) =>
        reconcileTask(data, filters, updated),
      );
    },
    onError: (_error, _values, snapshot) => {
      if (snapshot !== undefined) restoreSnapshot(queryClient, snapshot);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksAllKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (task: Task) => deleteTask(task.id, task.version),
    onMutate: async (task: Task): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: tasksAllKey });
      return forEachTasksQuery(queryClient, boardId, (data) => dropTask(data, task.id));
    },
    onError: (_error, _task, snapshot) => {
      if (snapshot !== undefined) restoreSnapshot(queryClient, snapshot);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksAllKey });
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
