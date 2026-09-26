import type { BoardRole, ActiveTaskStatus, TaskPriority, TaskStatus } from "@ksat/contracts";

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

export interface TaskPageRequest {
  readonly cursorKey?: string | undefined;
  readonly cursorId?: string | undefined;
  readonly limit: number;
}

export interface TaskPage {
  readonly items: readonly TaskRow[];
  readonly hasMore: boolean;
}

/**
 * Fully-resolved task field values the repository writes: the service has already
 * resolved a create request's optional reporterId to a concrete user id (the caller,
 * unless another member was named) before calling the repository.
 */
export interface TaskWriteInput {
  readonly name: string;
  readonly status: ActiveTaskStatus;
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
  listActiveForMember(boardId: string, userId: string, page: TaskPageRequest): Promise<TaskPage>;
  createForMember(
    boardId: string,
    userId: string,
    input: TaskWriteInput,
  ): Promise<CreateTaskResult>;
  getForMember(taskId: string, userId: string): Promise<TaskRow | null>;
  updateForMember(
    taskId: string,
    userId: string,
    input: TaskWriteInput & { readonly version: number },
  ): Promise<UpdateTaskResult>;
  deleteForMember(taskId: string, userId: string, version: number): Promise<DeleteTaskResult>;
}
