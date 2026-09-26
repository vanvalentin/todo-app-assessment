import { describe, expect, it } from "vitest";
import {
  activeTaskStatusSchema,
  createTaskRequestSchema,
  deleteTaskQuerySchema,
  taskListResponseSchema,
  taskPrioritySchema,
  taskSchema,
  taskStatusSchema,
  updateTaskRequestSchema,
} from "./tasks.js";

const validTask = {
  id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f2e",
  boardId: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f2f",
  sequence: 12,
  name: "Curate photo prints",
  status: "NOT_STARTED",
  priority: "HIGH",
  createdBy: { id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f30", name: "Ada", avatarSeed: "seed-1" },
  version: 1,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
};

describe("task contracts", () => {
  it("uses the documented domain status and priority vocabulary", () => {
    expect(taskStatusSchema.options).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "COMPLETED",
      "ARCHIVED",
    ]);
    expect(taskPrioritySchema.options).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(activeTaskStatusSchema.options).toEqual(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
  });

  it("parses a task and rejects unknown fields", () => {
    expect(taskSchema.parse(validTask)).toMatchObject({ sequence: 12, priority: "HIGH" });
    expect(taskSchema.safeParse({ ...validTask, tokenHash: "leak" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, sequence: 0 }).success).toBe(false);
  });

  it("defaults an incomplete creation request to NOT_STARTED and MEDIUM", () => {
    expect(createTaskRequestSchema.parse({ name: "  New task  " })).toEqual({
      name: "New task",
      status: "NOT_STARTED",
      priority: "MEDIUM",
    });
    expect(createTaskRequestSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ name: "x".repeat(161) }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ name: "Task", boardId: "other" }).success).toBe(
      false,
    );
  });

  it("never lets a client create or move a task into ARCHIVED", () => {
    expect(createTaskRequestSchema.safeParse({ name: "Task", status: "ARCHIVED" }).success).toBe(
      false,
    );
    expect(
      updateTaskRequestSchema.safeParse({
        name: "Task",
        status: "ARCHIVED",
        priority: "LOW",
        version: 1,
      }).success,
    ).toBe(false);
  });

  it("requires a version for updates and deletions", () => {
    expect(
      updateTaskRequestSchema.parse({
        name: "  Renamed  ",
        status: "IN_PROGRESS",
        priority: "LOW",
        version: 4,
      }),
    ).toEqual({ name: "Renamed", status: "IN_PROGRESS", priority: "LOW", version: 4 });
    expect(
      updateTaskRequestSchema.safeParse({ name: "Task", status: "COMPLETED", priority: "LOW" })
        .success,
    ).toBe(false);
    expect(deleteTaskQuerySchema.parse({ version: "3" })).toEqual({ version: 3 });
    expect(deleteTaskQuerySchema.safeParse({}).success).toBe(false);
    expect(deleteTaskQuerySchema.safeParse({ version: "stale" }).success).toBe(false);
    expect(deleteTaskQuerySchema.safeParse({ version: 1, force: true }).success).toBe(false);
  });

  it("parses a paginated task list response", () => {
    const parsed = taskListResponseSchema.parse({ items: [validTask], nextCursor: "cursor" });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.nextCursor).toBe("cursor");
  });
});
