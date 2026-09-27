import { describe, expect, it, vi } from "vitest";
import type { BoardRole, Task, TaskPriority, TaskStatus } from "@ksat/contracts";
import { HttpError } from "../src/errors.js";
import { encodeTaskCursor } from "../src/lib/taskCursor.js";
import { createTasksService } from "../src/modules/tasks/tasks.service.js";
import type {
  CreateTaskResult,
  DeleteTaskResult,
  TaskPage,
  TaskRow,
  TasksRepository,
  UpdateTaskResult,
} from "../src/modules/tasks/tasks.types.js";

const BOARD_ID = "01900000-0000-7000-8000-000000000001";
const USER_ID = "01900000-0000-7000-8000-000000000002";
const TASK_ID = "01900000-0000-7000-8000-000000000003";
const ASSIGNEE_ID = "01900000-0000-7000-8000-000000000005";

const assigneePreview = { id: ASSIGNEE_ID, name: "Grace", avatarSeed: "grace-seed" };
const PREREQUISITE_ID = "01900000-0000-7000-8000-000000000006";
const prerequisite = {
  id: PREREQUISITE_ID,
  sequence: 2,
  name: "Buy paper",
  status: "COMPLETED" as TaskStatus,
};
const updateInput = {
  name: "Curate photo prints",
  description: null,
  status: "NOT_STARTED" as const,
  priority: "MEDIUM" as const,
  assigneeId: null,
  dueDate: null,
  dependsOnIds: [PREREQUISITE_ID],
  version: 1,
};

function buildTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: TASK_ID,
    boardId: BOARD_ID,
    sequence: 1,
    name: "Curate photo prints",
    description: null,
    status: "NOT_STARTED" as TaskStatus,
    priority: "MEDIUM" as TaskPriority,
    dependsOn: [],
    assignee: null,
    dueDate: null,
    createdBy: { id: USER_ID, name: "Ada", avatarSeed: "seed" },
    version: 1,
    createdAt: new Date("2027-01-01T00:00:00.000Z"),
    updatedAt: new Date("2027-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function repository(overrides: Partial<TasksRepository> = {}): TasksRepository {
  return {
    findMembershipRole: vi.fn(async (): Promise<BoardRole | null> => "CONTRIBUTOR"),
    listForMember: vi.fn(async (): Promise<TaskPage> => ({ items: [buildTask()], hasMore: false })),
    createForMember: vi.fn(
      async (): Promise<CreateTaskResult> => ({ kind: "CREATED", task: buildTask() }),
    ),
    getForMember: vi.fn(async () => buildTask()),
    updateForMember: vi.fn(
      async (): Promise<UpdateTaskResult> => ({ kind: "UPDATED", task: buildTask({ version: 2 }) }),
    ),
    deleteForMember: vi.fn(async (): Promise<DeleteTaskResult> => "DELETED"),
    ...overrides,
  };
}

async function failureOf(operation: Promise<unknown>): Promise<HttpError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return error as HttpError;
  }
  throw new Error("expected the operation to fail");
}

describe("tasks service", () => {
  it("serializes a task and formats a stored due date as a calendar date", async () => {
    const service = createTasksService({
      repository: repository({
        getForMember: vi.fn(async () =>
          buildTask({
            assignee: assigneePreview,
            dueDate: new Date("2027-04-18T00:00:00.000Z"),
            description: "Pick **twelve** prints.",
            dependsOn: [prerequisite],
          }),
        ),
      }),
    });
    const task: Task = await service.getTask(USER_ID, TASK_ID);
    expect(task).toEqual({
      id: TASK_ID,
      boardId: BOARD_ID,
      sequence: 1,
      name: "Curate photo prints",
      description: "Pick **twelve** prints.",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      dependsOn: [prerequisite],
      assignee: assigneePreview,
      dueDate: "2027-04-18",
      createdBy: { id: USER_ID, name: "Ada", avatarSeed: "seed" },
      version: 1,
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("serializes a null assignee and null due date as null, not omitted", async () => {
    const service = createTasksService({ repository: repository() });
    const task = await service.getTask(USER_ID, TASK_ID);
    expect(task.assignee).toBeNull();
    expect(task.dueDate).toBeNull();
  });

  it("lists tasks for a member, excludes ARCHIVED by default, and emits a cursor only when more remain", async () => {
    const listForMember = vi.fn(
      async (): Promise<TaskPage> => ({ items: [buildTask()], hasMore: true }),
    );
    const service = createTasksService({
      repository: repository({ listForMember }),
    });
    const page = await service.listTasks(USER_ID, BOARD_ID, { limit: 50 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe(
      encodeTaskCursor({ s: "DUE_DATE", k: null, n: buildTask().sequence }),
    );
    expect(listForMember).toHaveBeenCalledWith(
      BOARD_ID,
      USER_ID,
      { statuses: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] },
      { sort: "DUE_DATE", limit: 50 },
    );
  });

  it("includes ARCHIVED and a status filter when requested", async () => {
    const listForMember = vi.fn(async (): Promise<TaskPage> => ({ items: [], hasMore: false }));
    const service = createTasksService({ repository: repository({ listForMember }) });
    await service.listTasks(USER_ID, BOARD_ID, {
      limit: 50,
      status: "IN_PROGRESS",
      includeArchived: true,
      assignee: "none",
      priority: "HIGH",
      q: "  Design  ",
    });
    expect(listForMember).toHaveBeenCalledWith(
      BOARD_ID,
      USER_ID,
      {
        statuses: ["IN_PROGRESS", "ARCHIVED"],
        assigneeId: null,
        priority: "HIGH",
        search: { name: "  Design  ", sequence: null },
      },
      { sort: "DUE_DATE", limit: 50 },
    );
  });

  it("resolves a due filter against the caller's supplied today", async () => {
    const listForMember = vi.fn(async (): Promise<TaskPage> => ({ items: [], hasMore: false }));
    const service = createTasksService({ repository: repository({ listForMember }) });
    await service.listTasks(USER_ID, BOARD_ID, { limit: 50, due: "OVERDUE", today: "2027-04-18" });
    expect(listForMember).toHaveBeenCalledWith(
      BOARD_ID,
      USER_ID,
      expect.objectContaining({
        due: { kind: "OVERDUE", today: new Date("2027-04-18T00:00:00.000Z") },
      }),
      { sort: "DUE_DATE", limit: 50 },
    );
  });

  it("forwards a decoded cursor and rejects a malformed one", async () => {
    const listForMember = vi.fn(async (): Promise<TaskPage> => ({ items: [], hasMore: false }));
    const service = createTasksService({ repository: repository({ listForMember }) });
    await expect(
      service.listTasks(USER_ID, BOARD_ID, {
        cursor: encodeTaskCursor({ s: "DUE_DATE", k: "2027-01-02", n: 3 }),
        limit: 10,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(listForMember).toHaveBeenCalledWith(
      BOARD_ID,
      USER_ID,
      { statuses: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] },
      { sort: "DUE_DATE", limit: 10, cursor: { key: "2027-01-02", sequence: 3 } },
    );

    const failure = await failureOf(
      service.listTasks(USER_ID, BOARD_ID, { cursor: "not-a-cursor", limit: 10 }),
    );
    expect(failure).toMatchObject({ status: 400, code: "INVALID_CURSOR" });
  });

  it("rejects a cursor produced under a different sort", async () => {
    const listForMember = vi.fn(async (): Promise<TaskPage> => ({ items: [], hasMore: false }));
    const service = createTasksService({ repository: repository({ listForMember }) });
    const cursor = encodeTaskCursor({ s: "NAME", k: "Alpha", n: 1 });
    const failure = await failureOf(
      service.listTasks(USER_ID, BOARD_ID, { cursor, limit: 10, sort: "DUE_DATE" }),
    );
    expect(failure).toMatchObject({ status: 400, code: "INVALID_CURSOR" });
    expect(listForMember).not.toHaveBeenCalled();
  });

  it("hides a board the caller does not belong to", async () => {
    const service = createTasksService({
      repository: repository({ findMembershipRole: vi.fn(async () => null) }),
    });
    expect(await failureOf(service.listTasks(USER_ID, BOARD_ID, { limit: 50 }))).toMatchObject({
      status: 404,
      code: "BOARD_NOT_FOUND",
    });
  });

  it("lets a contributor manage tasks and reports an invisible board as not found", async () => {
    const createForMember = vi.fn(async (): Promise<CreateTaskResult> => ({ kind: "NOT_FOUND" }));
    const service = createTasksService({
      repository: repository({
        findMembershipRole: vi.fn(async (): Promise<BoardRole | null> => "CONTRIBUTOR"),
        createForMember,
      }),
    });
    const failure = await failureOf(
      service.createTask(USER_ID, BOARD_ID, {
        name: "New task",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assigneeId: null,
        description: null,
        dependsOnIds: [],
        dueDate: null,
      }),
    );
    expect(failure).toMatchObject({ status: 404, code: "BOARD_NOT_FOUND" });
    expect(createForMember).toHaveBeenCalledWith(BOARD_ID, USER_ID, {
      name: "New task",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assigneeId: null,
      description: null,
      dependsOnIds: [],
      dueDate: null,
    });
  });

  it("rejects a task that depends on itself without touching the repository", async () => {
    const updateForMember = vi.fn(
      async (): Promise<UpdateTaskResult> => ({ kind: "UPDATED", task: buildTask() }),
    );
    const service = createTasksService({ repository: repository({ updateForMember }) });
    expect(
      await failureOf(
        service.updateTask(USER_ID, TASK_ID, { ...updateInput, dependsOnIds: [TASK_ID] }),
      ),
    ).toMatchObject({ status: 422, code: "TASK_DEPENDENCY_SELF" });
    expect(updateForMember).not.toHaveBeenCalled();
  });

  it.each([
    ["DEPENDENCY_NOT_FOUND", "TASK_DEPENDENCY_NOT_FOUND"],
    ["DEPENDENCY_CYCLE", "TASK_DEPENDENCY_CYCLE"],
    ["DEPENDENCIES_INCOMPLETE", "TASK_DEPENDENCIES_INCOMPLETE"],
  ] as const)("maps a %s dependency write to 422 %s", async (kind, code) => {
    const service = createTasksService({
      repository: repository({
        updateForMember: vi.fn(async (): Promise<UpdateTaskResult> => ({ kind })),
      }),
    });
    expect(await failureOf(service.updateTask(USER_ID, TASK_ID, updateInput))).toMatchObject({
      status: 422,
      code,
    });
  });

  it("maps an unknown or cross-board dependency on create to 422", async () => {
    const service = createTasksService({
      repository: repository({
        createForMember: vi.fn(
          async (): Promise<CreateTaskResult> => ({ kind: "DEPENDENCY_NOT_FOUND" }),
        ),
      }),
    });
    const createInput = {
      name: updateInput.name,
      description: updateInput.description,
      status: updateInput.status,
      priority: updateInput.priority,
      assigneeId: updateInput.assigneeId,
      dueDate: updateInput.dueDate,
      dependsOnIds: updateInput.dependsOnIds,
    };
    expect(await failureOf(service.createTask(USER_ID, BOARD_ID, createInput))).toMatchObject({
      status: 422,
      code: "TASK_DEPENDENCY_NOT_FOUND",
    });
  });

  it("maps stale updates and deletes to a task version conflict", async () => {
    const conflictRepository = repository({
      updateForMember: vi.fn(async (): Promise<UpdateTaskResult> => ({ kind: "VERSION_CONFLICT" })),
      deleteForMember: vi.fn(async (): Promise<DeleteTaskResult> => "VERSION_CONFLICT"),
    });
    const service = createTasksService({ repository: conflictRepository });
    const update = {
      name: "Renamed",
      status: "COMPLETED" as const,
      priority: "LOW" as const,
      assigneeId: null,
      description: null,
      dependsOnIds: [],
      dueDate: null,
      version: 1,
    };
    expect(await failureOf(service.updateTask(USER_ID, TASK_ID, update))).toMatchObject({
      status: 409,
      code: "TASK_VERSION_CONFLICT",
    });
    expect(await failureOf(service.deleteTask(USER_ID, TASK_ID, 1))).toMatchObject({
      status: 409,
      code: "TASK_VERSION_CONFLICT",
    });
  });

  it("reports unknown or unauthorized tasks as not found", async () => {
    const missingRepository = repository({
      getForMember: vi.fn(async () => null),
      updateForMember: vi.fn(async (): Promise<UpdateTaskResult> => ({ kind: "NOT_FOUND" })),
      deleteForMember: vi.fn(async (): Promise<DeleteTaskResult> => "NOT_FOUND"),
    });
    const service = createTasksService({ repository: missingRepository });
    expect(await failureOf(service.getTask(USER_ID, TASK_ID))).toMatchObject({
      status: 404,
      code: "TASK_NOT_FOUND",
    });
    expect(
      await failureOf(
        service.updateTask(USER_ID, TASK_ID, {
          name: "Renamed",
          status: "IN_PROGRESS",
          priority: "LOW",
          assigneeId: null,
          description: null,
          dependsOnIds: [],
          dueDate: null,
          version: 1,
        }),
      ),
    ).toMatchObject({ status: 404, code: "TASK_NOT_FOUND" });
    expect(await failureOf(service.deleteTask(USER_ID, TASK_ID, 1))).toMatchObject({
      status: 404,
      code: "TASK_NOT_FOUND",
    });
  });

  it("returns the updated task after a winning move, including its people and date", async () => {
    const service = createTasksService({
      repository: repository({
        updateForMember: vi.fn(
          async (): Promise<UpdateTaskResult> => ({
            kind: "UPDATED",
            task: buildTask({
              status: "IN_PROGRESS",
              version: 2,
              assignee: assigneePreview,
              dueDate: new Date("2027-05-01T00:00:00.000Z"),
            }),
          }),
        ),
      }),
    });
    const task = await service.updateTask(USER_ID, TASK_ID, {
      name: "Curate photo prints",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      assigneeId: ASSIGNEE_ID,
      description: null,
      dependsOnIds: [],
      dueDate: "2027-05-01",
      version: 1,
    });
    expect(task).toMatchObject({
      status: "IN_PROGRESS",
      version: 2,
      assignee: assigneePreview,
      dueDate: "2027-05-01",
    });
  });

  it("resolves deletion without returning a body", async () => {
    const deleteForMember = vi.fn(async (): Promise<DeleteTaskResult> => "DELETED");
    const service = createTasksService({ repository: repository({ deleteForMember }) });
    await expect(service.deleteTask(USER_ID, TASK_ID, 4)).resolves.toBeUndefined();
    expect(deleteForMember).toHaveBeenCalledWith(TASK_ID, USER_ID, 4);
  });
});
