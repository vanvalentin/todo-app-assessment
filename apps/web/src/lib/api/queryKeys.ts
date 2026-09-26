/** Shared TanStack Query keys; every invalidation references one of these. */
export const queryKeys = {
  boards: () => ["boards"] as const,
  board: (boardId: string) => ["board", boardId] as const,
  boardMembers: (boardId: string) => ["board", boardId, "members"] as const,
  boardInvitations: (boardId: string) => ["board", boardId, "invitations"] as const,
  boardTasks: (boardId: string) => ["board", boardId, "tasks"] as const,
  task: (taskId: string) => ["task", taskId] as const,
  invitation: (token: string) => ["invitation", token] as const,
};
