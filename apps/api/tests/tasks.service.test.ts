import { describe, expect, it, vi } from "vitest";
import type { BoardRole, Task, TaskPriority, TaskStatus } from "@ksat/contracts";
import { HttpError } from "../src/errors.js";
import { encodeCursor } from "../src/lib/cursor.js";
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

const reporterPreview = { id: USER_ID, name: "Ada", avatarSeed: "seed" };
const assigneePreview = { id: ASSIGNEE_ID, name: "Grace", avatarSeed: "grace-seed" };

function buildTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: TASK_ID,
    boardId: BOARD_ID,
    sequence: 1,
    name: "Curate photo prints",
    status: "NOT_STARTED" as TaskStatus,
    priority: "MEDIUM" as TaskPriority,
    assignee: null,
    reporter: reporterPreview,
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
    listActiveForMember: vi.fn(
      async (): Promise<TaskPage> => ({ items: [buildTask()], hasMore: false }),
    ),
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
      status: "NOT_STARTED",
      priority: "MEDIUM",
      assignee: assigneePreview,
      reporter: reporterPreview,
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

  it("lists active tasks for a member and emits a cursor only when more remain", async () => {
    const listActiveForMember = vi.fn(
      async (): Promise<TaskPage> => ({ items: [buildTask()], hasMore: true }),
    );
    const service = createTasksService({
      repository: repository({ listActiveForMember }),
    });
    const page = await service.listTasks(USER_ID, BOARD_ID, { limit: 50 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe(encodeCursor({ k: "2027-01-01T00:00:00.000Z", id: TASK_ID }));
    expect(listActiveForMember).toHaveBeenCalledWith(BOARD_ID, USER_ID, {
      cursorKey: undefined,
      cursorId: undefined,
      limit: 50,
    });
  });

  it("forwards a decoded cursor and rejects a malformed one", async () => {
    const listActiveForMember = vi.fn(
      async (): Promise<TaskPage> => ({ items: [], hasMore: false }),
    );
    const service = createTasksService({ repository: repository({ listActiveForMember }) });
    await expect(
      service.listTasks(USER_ID, BOARD_ID, {
        cursor: encodeCursor({ k: "2027-01-02T00:00:00.000Z", id: TASK_ID }),
        limit: 10,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(listActiveForMember).toHaveBeenCalledWith(BOARD_ID, USER_ID, {
      cursorKey: "2027-01-02T00:00:00.000Z",
      cursorId: TASK_ID,
      limit: 10,
    });

    const failure = await failureOf(
      service.listTasks(USER_ID, BOARD_ID, { cursor: "not-a-cursor", limit: 10 }),
    );
    expect(failure).toMatchObject({ status: 400, code: "INVALID_CURSOR" });
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
        dueDate: null,
      }),
    );
    expect(failure).toMatchObject({ status: 404, code: "BOARD_NOT_FOUND" });
    expect(createForMember).toHaveBeenCalledWith(BOARD_ID, USER_ID, {
      name: "New task",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assigneeId: null,
      reporterId: USER_ID,
      dueDate: null,
    });
  });

  it("defaults the reporter to the caller, and any active member may name another reporter", async () => {
    const createForMember = vi.fn(
      async (): Promise<CreateTaskResult> => ({ kind: "CREATED", task: buildTask() }),
    );
    const service = createTasksService({ repository: repository({ createForMember }) });
    await service.createTask(USER_ID, BOARD_ID, {
      name: "Task",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      assigneeId: null,
      reporterId: ASSIGNEE_ID,
      dueDate: null,
    });
    expect(createForMember).toHaveBeenCalledWith(
      BOARD_ID,
      USER_ID,
      expect.objectContaining({ reporterId: ASSIGNEE_ID }),
    );
  });

  it("maps a non-member assignee or reporter to a 422 on create and update", async () => {
    const createForMember = vi.fn(
      async (): Promise<CreateTaskResult> => ({ kind: "ASSIGNEE_NOT_MEMBER" }),
    );
    const createService = createTasksService({ repository: repository({ createForMember }) });
    expect(
      await failureOf(
        createService.createTask(USER_ID, BOARD_ID, {
          name: "Task",
          status: "NOT_STARTED",
          priority: "MEDIUM",
          assigneeId: "01900000-0000-7000-8000-000000000999",
          dueDate: null,
        }),
      ),
    ).toMatchObject({ status: 422, code: "TASK_ASSIGNEE_NOT_MEMBER" });

    const updateForMember = vi.fn(
      async (): Promise<UpdateTaskResult> => ({ kind: "REPORTER_NOT_MEMBER" }),
    );
    const updateService = createTasksService({ repository: repository({ updateForMember }) });
    expect(
      await failureOf(
        updateService.updateTask(USER_ID, TASK_ID, {
          name: "Task",
          status: "NOT_STARTED",
          priority: "MEDIUM",
          assigneeId: null,
          reporterId: "01900000-0000-7000-8000-000000000999",
          dueDate: null,
          version: 1,
        }),
      ),
    ).toMatchObject({ status: 422, code: "TASK_REPORTER_NOT_MEMBER" });
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
      reporterId: USER_ID,
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
          reporterId: USER_ID,
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
      reporterId: USER_ID,
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
