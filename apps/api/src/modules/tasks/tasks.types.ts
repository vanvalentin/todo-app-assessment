import type {
  BoardRole,
  ActiveTaskStatus,
  TaskPriority,
  TaskSort,
  TaskStatus,
} from "@ksat/contracts";

export interface TaskPersonPreview {
  readonly id: string;
  readonly name: string;
  readonly avatarSeed: string;
}

/** A persisted task row joined with the creator/assignee/reporter previews the API returns. */
export interface TaskRow {
  readonly id: string;
  readonly boardId: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assignee: TaskPersonPreview | null;
  readonly reporter: TaskPersonPreview;
  /** UTC midnight for the calendar day; formatted to `YYYY-MM-DD` by the service. */
  readonly dueDate: Date | null;
  readonly createdBy: TaskPersonPreview;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A due-date bucket, already resolved against the caller-supplied local "today". */
export type ResolvedDueFilter =
  | { readonly kind: "OVERDUE"; readonly today: Date }
  | { readonly kind: "TODAY"; readonly today: Date }
  | { readonly kind: "NEXT_7_DAYS"; readonly from: Date; readonly to: Date }
  | { readonly kind: "NONE" };

/** A parsed search term: a name substring, plus an optional exact sequence candidate. */
export interface TaskSearchFilter {
  readonly name: string;
  readonly sequence: number | null;
}

/**
 * Fully-resolved board-list filters. `statuses` is always the final set the query
 * should match (the archive toggle and any status filter are folded in by the
 * service); `assigneeId: null` means "unassigned", `undefined` means "no filter".
 */
export interface TaskListFilters {
  readonly statuses: readonly TaskStatus[];
  readonly assigneeId?: string | null;
  readonly priority?: TaskPriority;
  readonly due?: ResolvedDueFilter;
  readonly search?: TaskSearchFilter;
}

export interface TaskPageRequest {
  readonly sort: TaskSort;
  readonly cursor?: { readonly key: string | null; readonly sequence: number };
  readonly limit: number;
}

export interface TaskPage {
  readonly items: readonly TaskRow[];
  readonly hasMore: boolean;
}

/**
 * Fully-resolved task field values the repository writes: the service has already
 * resolved a create request's optional reporterId to a concrete user id (the caller,
 * unless another member was named) before calling the repository. Status is the full
 * enum because an update/move may archive or restore a task; create requests can
 * never carry ARCHIVED because `createTaskRequestSchema` restricts it upstream.
 */
export interface TaskWriteInput {
  readonly name: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeId: string | null;
  readonly reporterId: string;
  readonly dueDate: string | null;
}

export type CreateTaskResult =
  | { readonly kind: "CREATED"; readonly task: TaskRow }
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "ASSIGNEE_NOT_MEMBER" }
  | { readonly kind: "REPORTER_NOT_MEMBER" };

export type UpdateTaskResult =
  | { readonly kind: "UPDATED"; readonly task: TaskRow }
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "VERSION_CONFLICT" }
  | { readonly kind: "ASSIGNEE_NOT_MEMBER" }
  | { readonly kind: "REPORTER_NOT_MEMBER" };

export type DeleteTaskResult = "DELETED" | "NOT_FOUND" | "VERSION_CONFLICT";

/**
 * Every method is scoped by active board membership: the caller's user id is part
 * of the query itself, so an unauthorized or unknown resource cannot be
 * distinguished and no task is ever fetched by an id alone.
 */
export interface TasksRepository {
  findMembershipRole(boardId: string, userId: string): Promise<BoardRole | null>;
  listForMember(
    boardId: string,
    userId: string,
    filters: TaskListFilters,
    page: TaskPageRequest,
  ): Promise<TaskPage>;
  createForMember(
    boardId: string,
    userId: string,
    input: TaskWriteInput & { readonly status: ActiveTaskStatus },
  ): Promise<CreateTaskResult>;
  getForMember(taskId: string, userId: string): Promise<TaskRow | null>;
  updateForMember(
    taskId: string,
    userId: string,
    input: TaskWriteInput & { readonly version: number },
  ): Promise<UpdateTaskResult>;
  deleteForMember(taskId: string, userId: string, version: number): Promise<DeleteTaskResult>;
}
