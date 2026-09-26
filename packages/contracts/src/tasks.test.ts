import { describe, expect, it } from "vitest";
import { isoDateSchema } from "./common.js";
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

const assignee = {
  id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f31",
  name: "Grace",
  avatarSeed: "seed-2",
};
const reporter = { id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f30", name: "Ada", avatarSeed: "seed-1" };

const validTask = {
  id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f2e",
  boardId: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f2f",
  sequence: 12,
  name: "Curate photo prints",
  status: "NOT_STARTED",
  priority: "HIGH",
  assignee,
  reporter,
  dueDate: "2027-04-18",
  createdBy: reporter,
  version: 1,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
};

describe("isoDateSchema", () => {
  it("accepts a real calendar date", () => {
    expect(isoDateSchema.parse("2027-04-18")).toBe("2027-04-18");
  });

  it("rejects malformed and impossible dates", () => {
    expect(isoDateSchema.safeParse("2027-4-18").success).toBe(false);
    expect(isoDateSchema.safeParse("2027-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("not-a-date").success).toBe(false);
    expect(isoDateSchema.safeParse("2027-04-18T00:00:00.000Z").success).toBe(false);
  });
});

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

  it("parses a task, including a null assignee and due date, and rejects unknown fields", () => {
    expect(taskSchema.parse(validTask)).toMatchObject({ sequence: 12, priority: "HIGH" });
    expect(taskSchema.parse({ ...validTask, assignee: null, dueDate: null })).toMatchObject({
      assignee: null,
      dueDate: null,
    });
    expect(taskSchema.safeParse({ ...validTask, tokenHash: "leak" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, sequence: 0 }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, reporter: null }).success).toBe(false);
  });

  it("defaults an incomplete creation request to NOT_STARTED, MEDIUM, no assignee, and no due date", () => {
    expect(createTaskRequestSchema.parse({ name: "  New task  " })).toEqual({
      name: "New task",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      assigneeId: null,
      dueDate: null,
    });
    expect(createTaskRequestSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ name: "x".repeat(161) }).success).toBe(false);
    expect(createTaskRequestSchema.safeParse({ name: "Task", boardId: "other" }).success).toBe(
      false,
    );
  });

  it("accepts an explicit assignee, reporter, and due date on creation", () => {
    expect(
      createTaskRequestSchema.parse({
        name: "Task",
        assigneeId: assignee.id,
        reporterId: reporter.id,
        dueDate: "2027-04-18",
      }),
    ).toMatchObject({ assigneeId: assignee.id, reporterId: reporter.id, dueDate: "2027-04-18" });
    expect(createTaskRequestSchema.safeParse({ name: "Task", dueDate: "not-a-date" }).success).toBe(
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
        assigneeId: null,
        reporterId: reporter.id,
        dueDate: null,
        version: 1,
      }).success,
    ).toBe(false);
  });

  it("requires a version, reporter, assignee, and due date for updates", () => {
    expect(
      updateTaskRequestSchema.parse({
        name: "  Renamed  ",
        status: "IN_PROGRESS",
        priority: "LOW",
        assigneeId: assignee.id,
        reporterId: reporter.id,
        dueDate: "2027-04-18",
        version: 4,
      }),
    ).toEqual({
      name: "Renamed",
      status: "IN_PROGRESS",
      priority: "LOW",
      assigneeId: assignee.id,
      reporterId: reporter.id,
      dueDate: "2027-04-18",
      version: 4,
    });
    expect(
      updateTaskRequestSchema.safeParse({
        name: "Task",
        status: "COMPLETED",
        priority: "LOW",
        reporterId: reporter.id,
        dueDate: null,
      }).success,
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
