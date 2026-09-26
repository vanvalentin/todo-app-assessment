import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  ActiveTaskStatus,
  CreateTaskRequestInput,
  Task,
  TaskListResponse,
  TaskPriority,
} from "@ksat/contracts";
import { queryKeys } from "../../lib/api/queryKeys";
import { createTask, deleteTask, updateTask } from "../../lib/api/tasks";

type TasksData = InfiniteData<TaskListResponse, string | null>;

export interface TaskEditValues {
  readonly task: Task;
  readonly name: string;
  readonly status: ActiveTaskStatus;
  readonly priority: TaskPriority;
}

interface Snapshot {
  readonly previous: TasksData | undefined;
}

function replaceTask(data: TasksData | undefined, updated: Task): TasksData | undefined {
  if (data === undefined) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === updated.id ? updated : item)),
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
 * Task mutations with optimistic cache edits. Creation is a plain invalidation;
 * editing, moving, and deleting apply the change immediately, restore the exact
 * snapshot when the request fails, and always reconcile with the server afterwards,
 * so a `409` conflict leaves the authoritative version on screen.
 */
export function useTaskMutations(boardId: string) {
  const queryClient = useQueryClient();
  const tasksKey = queryKeys.boardTasks(boardId);

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskRequestInput) => createTask(boardId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ task, name, status, priority }: TaskEditValues) =>
      updateTask(task.id, { name, status, priority, version: task.version }),
    onMutate: async ({ task, name, status, priority }: TaskEditValues): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const previous = queryClient.getQueryData<TasksData>(tasksKey);
      queryClient.setQueryData<TasksData>(tasksKey, (current) =>
        replaceTask(current, { ...task, name, status, priority }),
      );
      return { previous };
    },
    onError: (_error, _values, snapshot) => {
      if (snapshot !== undefined) queryClient.setQueryData(tasksKey, snapshot.previous);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (task: Task) => deleteTask(task.id, task.version),
    onMutate: async (task: Task): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const previous = queryClient.getQueryData<TasksData>(tasksKey);
      queryClient.setQueryData<TasksData>(tasksKey, (current) => dropTask(current, task.id));
      return { previous };
    },
    onError: (_error, _task, snapshot) => {
      if (snapshot !== undefined) queryClient.setQueryData(tasksKey, snapshot.previous);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKey });
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
