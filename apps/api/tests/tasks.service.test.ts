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

function buildTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: TASK_ID,
    boardId: BOARD_ID,
    sequence: 1,
    name: "Curate photo prints",
    status: "NOT_STARTED" as TaskStatus,
    priority: "MEDIUM" as TaskPriority,
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
  it("serializes a task and exposes only contract fields", async () => {
    const service = createTasksService({ repository: repository() });
    const task: Task = await service.getTask(USER_ID, TASK_ID);
    expect(task).toEqual({
      id: TASK_ID,
      boardId: BOARD_ID,
      sequence: 1,
      name: "Curate photo prints",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      createdBy: { id: USER_ID, name: "Ada", avatarSeed: "seed" },
      version: 1,
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-01T00:00:00.000Z",
    });
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
      }),
    );
    expect(failure).toMatchObject({ status: 404, code: "BOARD_NOT_FOUND" });
    expect(createForMember).toHaveBeenCalledWith(BOARD_ID, USER_ID, {
      name: "New task",
      status: "IN_PROGRESS",
      priority: "HIGH",
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
          version: 1,
        }),
      ),
    ).toMatchObject({ status: 404, code: "TASK_NOT_FOUND" });
    expect(await failureOf(service.deleteTask(USER_ID, TASK_ID, 1))).toMatchObject({
      status: 404,
      code: "TASK_NOT_FOUND",
    });
  });

  it("returns the updated task after a winning move", async () => {
    const service = createTasksService({
      repository: repository({
        updateForMember: vi.fn(
          async (): Promise<UpdateTaskResult> => ({
            kind: "UPDATED",
            task: buildTask({ status: "IN_PROGRESS", version: 2 }),
          }),
        ),
      }),
    });
    const task = await service.updateTask(USER_ID, TASK_ID, {
      name: "Curate photo prints",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      version: 1,
    });
    expect(task).toMatchObject({ status: "IN_PROGRESS", version: 2 });
  });

  it("resolves deletion without returning a body", async () => {
    const deleteForMember = vi.fn(async (): Promise<DeleteTaskResult> => "DELETED");
    const service = createTasksService({ repository: repository({ deleteForMember }) });
    await expect(service.deleteTask(USER_ID, TASK_ID, 4)).resolves.toBeUndefined();
    expect(deleteForMember).toHaveBeenCalledWith(TASK_ID, USER_ID, 4);
  });
});
