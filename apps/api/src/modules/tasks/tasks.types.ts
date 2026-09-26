import type {
  BoardRole,
  CreateTaskRequest,
  TaskPriority,
  TaskStatus,
  UpdateTaskRequest,
} from "@ksat/contracts";

export interface TaskCreatorPreview {
  readonly id: string;
  readonly name: string;
  readonly avatarSeed: string;
}

/** A persisted task row joined with the creator preview the API returns. */
export interface TaskRow {
  readonly id: string;
  readonly boardId: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly createdBy: TaskCreatorPreview;
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

export type CreateTaskResult =
  | { readonly kind: "CREATED"; readonly task: TaskRow }
  | { readonly kind: "NOT_FOUND" };

export type UpdateTaskResult =
  | { readonly kind: "UPDATED"; readonly task: TaskRow }
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "VERSION_CONFLICT" };

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
    input: CreateTaskRequest,
  ): Promise<CreateTaskResult>;
  getForMember(taskId: string, userId: string): Promise<TaskRow | null>;
  updateForMember(
    taskId: string,
    userId: string,
    input: UpdateTaskRequest,
  ): Promise<UpdateTaskResult>;
  deleteForMember(taskId: string, userId: string, version: number): Promise<DeleteTaskResult>;
}
