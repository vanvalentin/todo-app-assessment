import { describe, expect, it } from "vitest";
import { isoDateSchema } from "./common.js";
import {
  activeTaskStatusSchema,
  createTaskRequestSchema,
  deleteTaskQuerySchema,
  TASK_DEPENDENCIES_MAX,
  TASK_DESCRIPTION_MAX_LENGTH,
  taskDueFilterSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskPrioritySchema,
  taskSchema,
  taskSortSchema,
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
  description: "Pick **twelve** prints.",
  status: "NOT_STARTED",
  priority: "HIGH",
  dependsOn: [
    {
      id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f40",
      sequence: 3,
      name: "Buy paper",
      status: "COMPLETED",
    },
  ],
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
      description: null,
      dependsOnIds: [],
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

  it("never lets a client create a task directly into ARCHIVED, but an edit/move may archive or restore it", () => {
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
        description: null,
        dependsOnIds: [],
        version: 1,
      }).success,
    ).toBe(true);
    expect(
      updateTaskRequestSchema.safeParse({
        name: "Task",
        status: "IN_PROGRESS",
        priority: "LOW",
        assigneeId: null,
        reporterId: reporter.id,
        dueDate: null,
        description: null,
        dependsOnIds: [],
        version: 2,
      }).success,
    ).toBe(true);
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
        description: "  - keep indentation\n",
        dependsOnIds: [validTask.dependsOn[0]?.id],
        version: 4,
      }),
    ).toEqual({
      name: "Renamed",
      status: "IN_PROGRESS",
      priority: "LOW",
      assigneeId: assignee.id,
      reporterId: reporter.id,
      dueDate: "2027-04-18",
      description: "  - keep indentation\n",
      dependsOnIds: [validTask.dependsOn[0]?.id],
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

  it("keeps Markdown verbatim, normalizes a blank description to null, and caps its length", () => {
    const parse = (description: unknown) =>
      createTaskRequestSchema.safeParse({ name: "Task", description });
    expect(parse("   \n\t ")).toMatchObject({ success: true, data: { description: null } });
    expect(parse("x".repeat(TASK_DESCRIPTION_MAX_LENGTH))).toMatchObject({ success: true });
    expect(parse("x".repeat(TASK_DESCRIPTION_MAX_LENGTH + 1)).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, description: "" }).success).toBe(false);
  });

  it("bounds dependency ids and rejects duplicates or malformed ids", () => {
    const ids = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `018f7f2e-3b8a-7c3a-8f2e-${String(index).padStart(12, "0")}`,
      );
    const parse = (dependsOnIds: unknown) =>
      createTaskRequestSchema.safeParse({ name: "Task", dependsOnIds });
    expect(parse(ids(TASK_DEPENDENCIES_MAX)).success).toBe(true);
    expect(parse(ids(TASK_DEPENDENCIES_MAX + 1)).success).toBe(false);
    expect(parse([...ids(1), ...ids(1)]).success).toBe(false);
    expect(parse(["not-a-uuid"]).success).toBe(false);
  });

  it("parses a paginated task list response", () => {
    const parsed = taskListResponseSchema.parse({ items: [validTask], nextCursor: "cursor" });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.nextCursor).toBe("cursor");
  });
});

describe("taskListQuerySchema", () => {
  it("defaults sort to DUE_DATE and archive visibility to false", () => {
    expect(taskListQuerySchema.parse({})).toMatchObject({
      sort: "DUE_DATE",
      includeArchived: false,
    });
  });

  it("uses the documented sort and due-filter vocabulary", () => {
    expect(taskSortSchema.options).toEqual(["DUE_DATE", "PRIORITY", "NEWEST", "OLDEST", "NAME"]);
    expect(taskDueFilterSchema.options).toEqual(["OVERDUE", "TODAY", "NEXT_7_DAYS", "NONE"]);
  });

  it("trims search text and drops an empty term", () => {
    expect(taskListQuerySchema.parse({ q: "  design  " })).toMatchObject({ q: "design" });
    expect(taskListQuerySchema.parse({ q: "   " }).q).toBeUndefined();
    expect(taskListQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });

  it("accepts an assignee id or the unassigned sentinel", () => {
    expect(taskListQuerySchema.parse({ assignee: "none" })).toMatchObject({ assignee: "none" });
    expect(
      taskListQuerySchema.parse({ assignee: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f31" }),
    ).toMatchObject({ assignee: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f31" });
    expect(taskListQuerySchema.safeParse({ assignee: "not-a-uuid" }).success).toBe(false);
  });

  it("parses includeArchived from the string query value", () => {
    expect(taskListQuerySchema.parse({ includeArchived: "true" }).includeArchived).toBe(true);
    expect(taskListQuerySchema.parse({ includeArchived: "false" }).includeArchived).toBe(false);
    expect(taskListQuerySchema.safeParse({ includeArchived: "yes" }).success).toBe(false);
  });

  it("requires today for a due bucket that depends on the viewer's local day, but not for NONE", () => {
    expect(taskListQuerySchema.safeParse({ due: "OVERDUE" }).success).toBe(false);
    expect(taskListQuerySchema.safeParse({ due: "TODAY" }).success).toBe(false);
    expect(taskListQuerySchema.safeParse({ due: "NEXT_7_DAYS" }).success).toBe(false);
    expect(taskListQuerySchema.safeParse({ due: "NONE" }).success).toBe(true);
    expect(taskListQuerySchema.safeParse({ due: "OVERDUE", today: "2027-04-18" }).success).toBe(
      true,
    );
  });

  it("rejects today supplied without a due filter", () => {
    expect(taskListQuerySchema.safeParse({ today: "2027-04-18" }).success).toBe(false);
  });

  it("rejects an unknown query key", () => {
    expect(taskListQuerySchema.safeParse({ sort: "DUE_DATE", extra: "x" }).success).toBe(false);
  });
});
