import { z } from "zod";
import { isoDateSchema, isoTimestampSchema, userPreviewSchema, uuidSchema } from "./common.js";
import { paginatedResponseSchema, paginationQuerySchema } from "./pagination.js";

/** Every persisted task state, including the archived state the board hides by default. */
export const taskStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Statuses a task can be created into or moved between via drag/the column pill; ARCHIVED is reached only through the archive action, never a plain move. */
export const activeTaskStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
export type ActiveTaskStatus = z.infer<typeof activeTaskStatusSchema>;

export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** Board-list sort keys; DUE_DATE is the default (soonest first, no date last). */
export const taskSortSchema = z.enum(["DUE_DATE", "PRIORITY", "NEWEST", "OLDEST", "NAME"]);
export type TaskSort = z.infer<typeof taskSortSchema>;

/** Due-date filter buckets. Resolved against the caller-supplied `today` because the viewer's local calendar day is authoritative, not the server's. */
export const taskDueFilterSchema = z.enum(["OVERDUE", "TODAY", "NEXT_7_DAYS", "NONE"]);
export type TaskDueFilter = z.infer<typeof taskDueFilterSchema>;

export const TASK_NAME_MAX_LENGTH = 160;

const taskNameSchema = z.string().trim().min(1).max(TASK_NAME_MAX_LENGTH);
const versionSchema = z.number().int().nonnegative();

/**
 * A task as returned by the API. Description, dependencies, attachments, and
 * schedules are later-phase fields and are deliberately absent rather than
 * returned as placeholder data. Assignee, reporter, and due date arrive in
 * phase 4b.
 */
export const taskSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    sequence: z.number().int().positive(),
    name: z.string().min(1).max(TASK_NAME_MAX_LENGTH),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    /** Optional: no board member is assigned by default. */
    assignee: userPreviewSchema.nullable(),
    /** Always set: defaults to the creator and can be reassigned to any active member. */
    reporter: userPreviewSchema,
    /** A calendar date, not a timestamp: overdue/days-left is computed from the viewer's local date. */
    dueDate: isoDateSchema.nullable(),
    createdBy: userPreviewSchema,
    version: versionSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type Task = z.infer<typeof taskSchema>;

export const taskListResponseSchema = paginatedResponseSchema(taskSchema);
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

export const createTaskRequestSchema = z
  .object({
    name: taskNameSchema,
    status: activeTaskStatusSchema.default("NOT_STARTED"),
    priority: taskPrioritySchema.default("MEDIUM"),
    /** Any active board member id, or null to leave the task unassigned. */
    assigneeId: uuidSchema.nullable().default(null),
    /** Omitted defaults to the caller; any active board member may be named instead. */
    reporterId: uuidSchema.optional(),
    dueDate: isoDateSchema.nullable().default(null),
  })
  .strict();
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type CreateTaskRequestInput = z.input<typeof createTaskRequestSchema>;

/**
 * Editing and moving share one contract: the full editable state plus its version.
 * Status accepts every persisted value, including ARCHIVED, so the phase 4c archive
 * action and drag-to-archive are one versioned PATCH like any other move.
 */
export const updateTaskRequestSchema = z
  .object({
    name: taskNameSchema,
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assigneeId: uuidSchema.nullable(),
    reporterId: uuidSchema,
    dueDate: isoDateSchema.nullable(),
    version: versionSchema,
  })
  .strict();
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

/** Deletion carries the expected version so a stale removal cannot win. */
export const deleteTaskQuerySchema = z
  .object({ version: z.coerce.number().int().nonnegative() })
  .strict();
export type DeleteTaskQuery = z.infer<typeof deleteTaskQuerySchema>;

const trimmedSearchSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => (value === undefined || value === "" ? undefined : value));

/** An assignee filter names an active member id, or "none" for an unassigned task. */
const assigneeFilterSchema = z.union([uuidSchema, z.literal("none")]);

const booleanQuerySchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

/**
 * The board-list query: search, filter, sort, and archive visibility all live here so
 * the API and the URL-backed web state share one shape. `today` is the viewer's local
 * calendar day, required only for the due-date buckets that depend on it.
 */
export const taskListQuerySchema = paginationQuerySchema
  .extend({
    q: trimmedSearchSchema,
    assignee: assigneeFilterSchema.optional(),
    priority: taskPrioritySchema.optional(),
    status: activeTaskStatusSchema.optional(),
    includeArchived: booleanQuerySchema,
    due: taskDueFilterSchema.optional(),
    today: isoDateSchema.optional(),
    sort: taskSortSchema.default("DUE_DATE"),
  })
  .strict()
  .refine((value) => value.due === undefined || value.due === "NONE" || value.today !== undefined, {
    message: "today is required when filtering by OVERDUE, TODAY, or NEXT_7_DAYS",
    path: ["today"],
  })
  .refine((value) => value.today === undefined || value.due !== undefined, {
    message: "today must only be supplied together with due",
    path: ["today"],
  });
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
