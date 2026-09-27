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

/** RFC 5545 wall-clock anchor without an offset; interpreted in the selected IANA zone. */
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "must be a local date-time without an offset")
  .refine(
    (value) => !Number.isNaN(Date.parse(value.replace("T", " ") + "Z")),
    "must be a valid date-time",
  );
export type LocalDateTime = z.infer<typeof localDateTimeSchema>;

export const taskScheduleInputSchema = z
  .object({
    rrule: z.string().trim().min(1).max(500),
    timezone: z.string().trim().min(1).max(64),
    startLocal: localDateTimeSchema,
    enabled: z.boolean().default(true),
  })
  .strict();
export type TaskScheduleInput = z.infer<typeof taskScheduleInputSchema>;

export const taskScheduleSchema = z
  .object({
    id: uuidSchema,
    rrule: z.string().min(1).max(500),
    timezone: z.string().min(1).max(64),
    startLocal: localDateTimeSchema,
    enabled: z.boolean(),
    nextRunAt: isoTimestampSchema.nullable(),
  })
  .strict();
export type TaskSchedule = z.infer<typeof taskScheduleSchema>;

export const taskOccurrenceSchema = z
  .object({
    id: uuidSchema,
    scheduledAt: isoTimestampSchema,
    templateTaskId: uuidSchema.nullable(),
    generatedTaskId: uuidSchema.nullable(),
  })
  .strict();
export type TaskOccurrence = z.infer<typeof taskOccurrenceSchema>;

export const taskRecurrenceSchema = z
  .object({
    schedule: taskScheduleSchema.nullable(),
    occurrence: taskOccurrenceSchema.nullable(),
  })
  .strict();
export type TaskRecurrence = z.infer<typeof taskRecurrenceSchema>;

/** Board-list sort keys; DUE_DATE is the default (soonest first, no date last). */
export const taskSortSchema = z.enum(["DUE_DATE", "PRIORITY", "NEWEST", "OLDEST", "NAME"]);
export type TaskSort = z.infer<typeof taskSortSchema>;

/** Due-date filter buckets. Resolved against the caller-supplied `today` because the viewer's local calendar day is authoritative, not the server's. */
export const taskDueFilterSchema = z.enum(["OVERDUE", "TODAY", "NEXT_7_DAYS", "NONE"]);
export type TaskDueFilter = z.infer<typeof taskDueFilterSchema>;

export const TASK_NAME_MAX_LENGTH = 160;
/** Markdown source length cap, counted in UTF-16 code units like the database CHECK. */
export const TASK_DESCRIPTION_MAX_LENGTH = 10_000;
/** A task may name at most this many prerequisite tasks. */
export const TASK_DEPENDENCIES_MAX = 20;

const taskNameSchema = z.string().trim().min(1).max(TASK_NAME_MAX_LENGTH);
const versionSchema = z.number().int().nonnegative();

/**
 * Markdown description input. The source is kept verbatim (whitespace is meaningful
 * in Markdown), except that an empty or whitespace-only value is normalized to null.
 */
const taskDescriptionInputSchema = z
  .string()
  .max(TASK_DESCRIPTION_MAX_LENGTH)
  .transform((value) => (value.trim() === "" ? null : value))
  .nullable();

/** Prerequisite task ids: bounded and duplicate-free, so each edge is stated once. */
const dependsOnIdsSchema = z
  .array(uuidSchema)
  .max(TASK_DEPENDENCIES_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { message: "must not repeat a task" });

/** A compact preview of a same-board task this task depends on. */
export const taskReferenceSchema = z
  .object({
    id: uuidSchema,
    sequence: z.number().int().positive(),
    name: z.string().min(1).max(TASK_NAME_MAX_LENGTH),
    status: taskStatusSchema,
  })
  .strict();
export type TaskReference = z.infer<typeof taskReferenceSchema>;

/**
 * A task as returned by the API. Attachment metadata remains a separate child
 * resource; recurrence metadata is embedded when the task is a template or occurrence.
 * Assignee, reporter, and due date arrive in phase 4b; Markdown and dependencies in phase 5a.
 */
export const taskSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    sequence: z.number().int().positive(),
    name: z.string().min(1).max(TASK_NAME_MAX_LENGTH),
    /** Raw Markdown source; clients render it without raw HTML. */
    description: z.string().min(1).max(TASK_DESCRIPTION_MAX_LENGTH).nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    /** Same-board prerequisites, ordered by board sequence. */
    dependsOn: z.array(taskReferenceSchema).max(TASK_DEPENDENCIES_MAX),
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
    /** Recurrence metadata is omitted by legacy clients and present on API responses. */
    recurrence: taskRecurrenceSchema.optional(),
  })
  .strict();
export type Task = z.infer<typeof taskSchema>;

export const taskListResponseSchema = paginatedResponseSchema(taskSchema);
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

export const createTaskRequestSchema = z
  .object({
    name: taskNameSchema,
    description: taskDescriptionInputSchema.default(null),
    status: activeTaskStatusSchema.default("NOT_STARTED"),
    priority: taskPrioritySchema.default("MEDIUM"),
    /** Any active board member id, or null to leave the task unassigned. */
    assigneeId: uuidSchema.nullable().default(null),
    /** Omitted defaults to the caller; any active board member may be named instead. */
    reporterId: uuidSchema.optional(),
    dueDate: isoDateSchema.nullable().default(null),
    /** Ids of other tasks on the same board that this task depends on. */
    dependsOnIds: dependsOnIdsSchema.default([]),
    /** Optional for backwards-compatible clients; omitted means no schedule. */
    schedule: taskScheduleInputSchema.nullable().optional(),
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
    description: taskDescriptionInputSchema,
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assigneeId: uuidSchema.nullable(),
    reporterId: uuidSchema,
    dueDate: isoDateSchema.nullable(),
    /** Replaces the full prerequisite set; an empty array clears it. */
    dependsOnIds: dependsOnIdsSchema,
    /** Omitted preserves the existing schedule; null removes it. */
    schedule: taskScheduleInputSchema.nullable().optional(),
    version: versionSchema,
  })
  .strict();
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
export type UpdateTaskRequestInput = z.input<typeof updateTaskRequestSchema>;

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
