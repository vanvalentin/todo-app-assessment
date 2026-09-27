import type { TaskListFilterParams } from "./tasks";

/** Shared TanStack Query keys; every invalidation references one of these. */
export const queryKeys = {
  boards: () => ["boards"] as const,
  board: (boardId: string) => ["board", boardId] as const,
  boardMembers: (boardId: string) => ["board", boardId, "members"] as const,
  boardInvitations: (boardId: string) => ["board", boardId, "invitations"] as const,
  /** The board's task list under one resolved filter set; a distinct cache entry per view. */
  boardTasks: (boardId: string, filters: TaskListFilterParams) =>
    ["board", boardId, "tasks", filters] as const,
  /** The prefix shared by every filtered task-list cache entry for a board. */
  boardTasksAll: (boardId: string) => ["board", boardId, "tasks"] as const,
  task: (taskId: string) => ["task", taskId] as const,
  invitation: (token: string) => ["invitation", token] as const,
};
