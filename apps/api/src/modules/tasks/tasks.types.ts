import type {
  BoardRole,
  ActiveTaskStatus,
  TaskPriority,
  TaskSort,
  TaskStatus,
  TaskRecurrence,
} from "@ksat/contracts";

export interface TaskPersonPreview {
  readonly id: string;
  readonly name: string;
  readonly avatarSeed: string;
}

/** A same-board prerequisite of a task, as embedded in its response. */
export interface TaskReferenceRow {
  readonly id: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: TaskStatus;
}

/** A persisted task row joined with the creator and assignee previews the API returns. */
export interface TaskRow {
  readonly id: string;
  readonly boardId: string;
  readonly sequence: number;
  readonly name: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  /** Prerequisites ordered by board sequence. */
  readonly dependsOn: readonly TaskReferenceRow[];
  readonly assignee: TaskPersonPreview | null;
  /** UTC midnight for the calendar day; formatted to `YYYY-MM-DD` by the service. */
  readonly dueDate: Date | null;
  readonly createdBy: TaskPersonPreview;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly recurrence?: TaskRecurrence;
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
 * resolved request fields before calling the repository. Status is the full
 * enum because an update/move may archive or restore a task; create requests can
 * never carry ARCHIVED because `createTaskRequestSchema` restricts it upstream.
 */
export interface TaskScheduleWrite {
  readonly id?: string;
  readonly rrule: string;
  readonly timezone: string;
  readonly startLocal: string;
  readonly enabled: boolean;
  readonly nextRunAt: Date | null;
}

export interface TaskWriteInput {
  readonly name: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeId: string | null;
  readonly dueDate: string | null;
  /** The complete prerequisite set; never contains the task's own id (the service rejects that). */
  readonly dependsOnIds: readonly string[];
  /** Undefined preserves an existing schedule during PATCH; null removes it. */
  readonly schedule?: TaskScheduleWrite | null | undefined;
}

/** Validation failures shared by create and update. */
export type TaskWriteViolation =
  | { readonly kind: "ASSIGNEE_NOT_MEMBER" }
  /** A dependency id is unknown, deleted, or belongs to another board. */
  | { readonly kind: "DEPENDENCY_NOT_FOUND" }
  /** Moving into IN_PROGRESS or COMPLETED requires every selected prerequisite to be settled. */
  | { readonly kind: "DEPENDENCIES_INCOMPLETE" };

export type CreateTaskResult =
  | { readonly kind: "CREATED"; readonly task: TaskRow }
  | { readonly kind: "NOT_FOUND" }
  | TaskWriteViolation;

export type UpdateTaskResult =
  | { readonly kind: "UPDATED"; readonly task: TaskRow }
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "VERSION_CONFLICT" }
  /** A new edge would let a prerequisite (transitively) depend on this task. */
  | { readonly kind: "DEPENDENCY_CYCLE" }
  | TaskWriteViolation;

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
