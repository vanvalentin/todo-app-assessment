import { z } from "zod";
import { isoTimestampSchema, userPreviewSchema, uuidSchema } from "./common.js";
import { paginatedResponseSchema } from "./pagination.js";

/** Every persisted task state, including the archived state the board hides by default. */
export const taskStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Statuses the task board can move between; ARCHIVED arrives with the archive slice. */
export const activeTaskStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
export type ActiveTaskStatus = z.infer<typeof activeTaskStatusSchema>;

export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const TASK_NAME_MAX_LENGTH = 160;

const taskNameSchema = z.string().trim().min(1).max(TASK_NAME_MAX_LENGTH);
const versionSchema = z.number().int().nonnegative();

/**
 * A task as returned by the API. Assignee, reporter, due date, description,
 * dependencies, attachments, and schedules are later-phase fields and are
 * deliberately absent rather than returned as placeholder data.
 */
export const taskSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    sequence: z.number().int().positive(),
    name: z.string().min(1).max(TASK_NAME_MAX_LENGTH),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
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
  })
  .strict();
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type CreateTaskRequestInput = z.input<typeof createTaskRequestSchema>;

/** Editing and moving share one contract: the full editable state plus its version. */
export const updateTaskRequestSchema = z
  .object({
    name: taskNameSchema,
    status: activeTaskStatusSchema,
    priority: taskPrioritySchema,
    version: versionSchema,
  })
  .strict();
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

/** Deletion carries the expected version so a stale removal cannot win. */
export const deleteTaskQuerySchema = z
  .object({ version: z.coerce.number().int().nonnegative() })
  .strict();
export type DeleteTaskQuery = z.infer<typeof deleteTaskQuerySchema>;
