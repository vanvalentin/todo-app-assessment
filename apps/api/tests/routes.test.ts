import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type {
  BoardSummary,
  BoardListResponse,
  BoardMemberListResponse,
  PendingInvitationListResponse,
  InvitationPreview,
  AcceptInvitationResponse,
  CreateInvitationResponse,
  Task,
  TaskListResponse,
} from "@ksat/contracts";
import { createApp } from "../src/app.js";
import { configureApiRoutes } from "../src/routes.js";
import { HttpError } from "../src/errors.js";
import type { ResolveSession } from "../src/auth/session.js";
import type { BoardsService } from "../src/modules/boards/boards.service.js";
import type { InvitationsService } from "../src/modules/invitations/invitations.service.js";
import type { TasksService } from "../src/modules/tasks/tasks.service.js";
import type { RateLimiter } from "../src/lib/rateLimiter.js";

const summary: BoardSummary = {
  id: "01900000-0000-7000-8000-000000000001",
  name: "Demo",
  description: null,
  ownerId: "01900000-0000-7000-8000-000000000002",
  role: "ADMIN",
  memberCount: 1,
  memberPreview: [{ id: "01900000-0000-7000-8000-000000000002", name: "Ada", avatarSeed: "seed" }],
  version: 1,
  createdAt: "2027-01-01T00:00:00.000Z",
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const boardsResponse: BoardListResponse = { items: [summary], nextCursor: null };
const membersResponse: BoardMemberListResponse = { items: [], nextCursor: null };
const invitationsResponse: PendingInvitationListResponse = { items: [], nextCursor: null };
const inviter = { id: "01900000-0000-7000-8000-000000000002", name: "Ada", avatarSeed: "seed" };
const preview: InvitationPreview = {
  boardId: summary.id,
  boardName: summary.name,
  email: "new@example.test",
  role: "CONTRIBUTOR",
  invitedBy: inviter,
  expiresAt: "2027-01-08T00:00:00.000Z",
};
const created: CreateInvitationResponse = {
  id: "01900000-0000-7000-8000-000000000003",
  boardId: summary.id,
  email: "new@example.test",
  role: "CONTRIBUTOR",
  invitedById: summary.ownerId,
  expiresAt: "2027-01-08T00:00:00.000Z",
  createdAt: "2027-01-01T00:00:00.000Z",
  emailDelivery: "SENT",
};
const accepted: AcceptInvitationResponse = {
  boardId: summary.id,
  boardName: summary.name,
  role: "CONTRIBUTOR",
  joinedAt: "2027-01-01T00:00:00.000Z",
  alreadyMember: false,
};

const task: Task = {
  id: "01900000-0000-7000-8000-000000000401",
  boardId: summary.id,
  sequence: 1,
  name: "Curate photo prints",
  status: "NOT_STARTED",
  priority: "MEDIUM",
  createdBy: { id: summary.ownerId, name: "Ada", avatarSeed: "seed" },
  version: 1,
  createdAt: "2027-01-01T00:00:00.000Z",
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const taskList: TaskListResponse = { items: [task], nextCursor: null };

function testApp(
  rateLimiter: RateLimiter = {
    consume: async () => ({ allowed: true, remaining: 10, resetSeconds: 60 }),
  },
  overrides: {
    boards?: Partial<BoardsService>;
    invitations?: Partial<InvitationsService>;
    tasks?: Partial<TasksService>;
  } = {},
): ReturnType<typeof createApp> {
  const boards: BoardsService = {
    createBoard: async () => summary,
    listBoards: async () => boardsResponse,
    getBoard: async () => summary,
    listMembers: async () => membersResponse,
    ...overrides.boards,
    updateBoard: overrides.boards?.updateBoard ?? (async () => summary),
  };
  const invitations: InvitationsService = {
    revoke: async () => undefined,
    listPending: async () => invitationsResponse,
    create: async () => created,
    preview: async () => preview,
    accept: async () => accepted,
    ...overrides.invitations,
  };
  const tasks: TasksService = {
    listTasks: async () => taskList,
    createTask: async () => task,
    getTask: async () => task,
    updateTask: async () => task,
    deleteTask: async () => undefined,
    ...overrides.tasks,
  };
  const resolveSession: ResolveSession = async (request) =>
    request.header("x-user")
      ? { user: { id: "user-1", name: "Ada", email: "ada@example.test", avatarSeed: "seed" } }
      : null;
  return createApp({
    logger: pino({ level: "silent" }),
    configureRoutes: (app) =>
      configureApiRoutes(app, {
        boards,
        invitations,
        tasks,
        resolveSession,
        rateLimiter,
        trustedOrigins: ["http://localhost:8080"],
      }),
  });
}

describe("phase 3 application routes", () => {
  it("creates a board through a trusted-origin authenticated route", async () => {
    let received: unknown;
    const response = await request(
      testApp(undefined, {
        boards: {
          createBoard: async (_userId, input) => {
            received = input;
            return { ...summary, name: input.name, description: input.description };
          },
        },
      }),
    )
      .post("/api/v1/boards")
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "  New board  ", description: "  " });
    expect(response.status).toBe(201);
    expect(received).toEqual({ name: "New board", description: null });
    expect(response.body).toMatchObject({ name: "New board", ownerId: summary.ownerId });
  });

  it("rejects invalid, untrusted, and unauthenticated board creation", async () => {
    const invalid = await request(testApp())
      .post("/api/v1/boards")
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "", description: null });
    const untrusted = await request(testApp())
      .post("/api/v1/boards")
      .set("x-user", "user-1")
      .send({ name: "Board", description: null });
    const unauthenticated = await request(testApp())
      .post("/api/v1/boards")
      .set("Origin", "http://localhost:8080")
      .send({ name: "Board", description: null });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("VALIDATION_ERROR");
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(unauthenticated.status).toBe(401);
  });

  it("requires a session for board list", async () => {
    const response = await request(testApp()).get("/api/v1/boards");
    expect(response.status).toBe(401);
    expect(response.type).toBe("application/problem+json");
    expect(response.body.code).toBe("UNAUTHENTICATED");
  });
  it("returns validation Problem Details for malformed board ids", async () => {
    const response = await request(testApp())
      .get("/api/v1/boards/not-a-uuid")
      .set("x-user", "user-1");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "request" })]),
    );
  });
  it("lists boards and members for a session", async () => {
    const boards = await request(testApp()).get("/api/v1/boards").set("x-user", "user-1");
    const members = await request(testApp())
      .get(`/api/v1/boards/${summary.id}/members`)
      .set("x-user", "user-1");
    expect(boards.status).toBe(200);
    expect(boards.body.items[0].name).toBe("Demo");
    expect(members.status).toBe(200);
  });
  it("updates a board through the trusted-origin PATCH route", async () => {
    let received: unknown;
    const response = await request(
      testApp(undefined, {
        boards: {
          updateBoard: async (_userId, _boardId, input) => {
            received = input;
            return { ...summary, name: input.name, description: input.description, version: 2 };
          },
        },
      }),
    )
      .patch(`/api/v1/boards/${summary.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "  Renamed  ", description: "  ", version: 1 });
    expect(response.status).toBe(200);
    expect(received).toEqual({ name: "Renamed", description: null, version: 1 });
    expect(response.body.name).toBe("Renamed");
  });

  it("rejects malformed PATCH requests, missing origin, and unauthenticated callers", async () => {
    const malformedId = await request(testApp())
      .patch("/api/v1/boards/not-a-uuid")
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "Board", description: null, version: 1 });
    const malformedBody = await request(testApp())
      .patch(`/api/v1/boards/${summary.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "", description: null, version: 1 });
    const missingOrigin = await request(testApp())
      .patch(`/api/v1/boards/${summary.id}`)
      .set("x-user", "user-1")
      .send({ name: "Board", description: null, version: 1 });
    const unauthenticated = await request(testApp())
      .patch(`/api/v1/boards/${summary.id}`)
      .set("Origin", "http://localhost:8080")
      .send({ name: "Board", description: null, version: 1 });
    expect(malformedId.status).toBe(400);
    expect(malformedBody.status).toBe(400);
    expect(missingOrigin.status).toBe(403);
    expect(missingOrigin.body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(unauthenticated.status).toBe(401);
  });

  it("maps admin authorization, not-found, and stale conflicts", async () => {
    const forbidden = await request(
      testApp(undefined, {
        boards: {
          updateBoard: async () => {
            throw new HttpError(403, "BOARD_ADMIN_REQUIRED", "Administrator access is required.");
          },
        },
      }),
    )
      .patch(`/api/v1/boards/${summary.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "Board", description: null, version: 1 });
    const missing = await request(
      testApp(undefined, {
        boards: {
          updateBoard: async () => {
            throw new HttpError(404, "BOARD_NOT_FOUND", "The board was not found.");
          },
        },
      }),
    )
      .patch(`/api/v1/boards/${summary.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "Board", description: null, version: 1 });
    const stale = await request(
      testApp(undefined, {
        boards: {
          updateBoard: async () => {
            throw new HttpError(
              409,
              "BOARD_VERSION_CONFLICT",
              "The board was changed by someone else.",
            );
          },
        },
      }),
    )
      .patch(`/api/v1/boards/${summary.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "Board", description: null, version: 1 });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("BOARD_ADMIN_REQUIRED");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("BOARD_NOT_FOUND");
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("BOARD_VERSION_CONFLICT");
  });

  it("rejects state changes without a trusted Origin", async () => {
    const response = await request(testApp())
      .post(`/api/v1/boards/${summary.id}/invitations`)
      .set("x-user", "user-1")
      .send({ email: "new@example.test", role: "CONTRIBUTOR" });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ORIGIN_NOT_ALLOWED");
  });
  it("validates invitation input and accepts valid invitation creation", async () => {
    const invalid = await request(testApp())
      .post(`/api/v1/boards/${summary.id}/invitations`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ email: "bad", role: "OWNER" });
    const valid = await request(testApp())
      .post(`/api/v1/boards/${summary.id}/invitations`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ email: "new@example.test", role: "CONTRIBUTOR" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors.length).toBeGreaterThan(0);
    expect(valid.status).toBe(201);
    expect(valid.body.emailDelivery).toBe("SENT");
  });
  it("cancels an invitation through the protected DELETE route", async () => {
    let received: unknown;
    const response = await request(
      testApp(undefined, {
        invitations: {
          revoke: async (userId, boardId, invitationId) => {
            received = { userId, boardId, invitationId };
          },
        },
      }),
    )
      .delete(`/api/v1/boards/${summary.id}/invitations/${created.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080");
    expect(response.status).toBe(204);
    expect(received).toEqual({
      userId: "user-1",
      boardId: summary.id,
      invitationId: created.id,
    });
  });

  it("rejects malformed, untrusted, and unauthenticated invitation cancellation", async () => {
    const malformed = await request(testApp())
      .delete(`/api/v1/boards/${summary.id}/invitations/not-a-uuid`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080");
    const untrusted = await request(testApp())
      .delete(`/api/v1/boards/${summary.id}/invitations/${created.id}`)
      .set("x-user", "user-1");
    const unauthenticated = await request(testApp())
      .delete(`/api/v1/boards/${summary.id}/invitations/${created.id}`)
      .set("Origin", "http://localhost:8080");
    expect(malformed.status).toBe(400);
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(unauthenticated.status).toBe(401);
  });

  it("serves preview and protects acceptance", async () => {
    const previewResponse = await request(testApp()).get(
      "/api/v1/invitations/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    const unauthenticated = await request(testApp())
      .post("/api/v1/invitations/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/accept")
      .set("Origin", "http://localhost:8080");
    const acceptedResponse = await request(testApp())
      .post("/api/v1/invitations/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/accept")
      .set("Origin", "http://localhost:8080")
      .set("x-user", "user-1");
    expect(previewResponse.status).toBe(200);
    expect(unauthenticated.status).toBe(401);
    expect(acceptedResponse.status).toBe(200);
  });
  it("maps service 404, 409, and expired 410 errors to Problem Details", async () => {
    const missingBoard = await request(
      testApp(undefined, {
        boards: {
          getBoard: async () => {
            throw new HttpError(404, "BOARD_NOT_FOUND", "Board not found.");
          },
        },
      }),
    )
      .get(`/api/v1/boards/${summary.id}`)
      .set("x-user", "user-1");
    const conflict = await request(
      testApp(undefined, {
        invitations: {
          create: async () => {
            throw new HttpError(409, "INVITATION_CONFLICT", "Invitation conflict.");
          },
        },
      }),
    )
      .post(`/api/v1/boards/${summary.id}/invitations`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ email: "new@example.test", role: "CONTRIBUTOR" });
    const expired = await request(
      testApp(undefined, {
        invitations: {
          preview: async () => {
            throw new HttpError(410, "INVITATION_EXPIRED", "The invitation has expired.");
          },
        },
      }),
    ).get("/api/v1/invitations/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(missingBoard.status).toBe(404);
    expect(missingBoard.body.code).toBe("BOARD_NOT_FOUND");
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("INVITATION_CONFLICT");
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe("INVITATION_EXPIRED");
  });
  it("maps rate-limit exhaustion to 429 Problem Details", async () => {
    const response = await request(
      testApp({ consume: async () => ({ allowed: false, remaining: 0, resetSeconds: 12 }) }),
    ).get("/api/v1/invitations/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(response.status).toBe(429);
    expect(response.body.code).toBe("RATE_LIMITED");
  });
  it("maps service authorization failures without leaking internals", async () => {
    const boards: BoardsService = {
      createBoard: async () => summary,
      listBoards: async () => boardsResponse,
      getBoard: async () => summary,
      listMembers: async () => membersResponse,
      updateBoard: async () => summary,
    };
    const invitations: InvitationsService = {
      revoke: async () => undefined,
      listPending: async () => {
        throw new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action.");
      },
      create: async () => created,
      preview: async () => preview,
      accept: async () => accepted,
    };
    const resolveSession: ResolveSession = async () => ({
      user: { id: "user-1", name: "Ada", email: "ada@example.test", avatarSeed: "seed" },
    });
    const tasks: TasksService = {
      listTasks: async () => taskList,
      createTask: async () => task,
      getTask: async () => task,
      updateTask: async () => task,
      deleteTask: async () => undefined,
    };
    const app = createApp({
      logger: pino({ level: "silent" }),
      configureRoutes: (expressApp) =>
        configureApiRoutes(expressApp, {
          boards,
          invitations,
          tasks,
          resolveSession,
          rateLimiter: { consume: async () => ({ allowed: true, remaining: 1, resetSeconds: 1 }) },
          trustedOrigins: ["http://localhost:8080"],
        }),
    });
    const response = await request(app)
      .get(`/api/v1/boards/${summary.id}/invitations`)
      .set("x-user", "user-1");
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });
});

describe("phase 4a task routes", () => {
  it("lists board tasks for a session and rejects malformed or anonymous requests", async () => {
    const listed = await request(testApp())
      .get(`/api/v1/boards/${summary.id}/tasks`)
      .set("x-user", "user-1");
    expect(listed.status).toBe(200);
    expect(listed.body.items[0]).toMatchObject({ sequence: 1, status: "NOT_STARTED" });

    const malformed = await request(testApp())
      .get("/api/v1/boards/not-a-uuid/tasks")
      .set("x-user", "user-1");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("VALIDATION_ERROR");

    const anonymous = await request(testApp()).get(`/api/v1/boards/${summary.id}/tasks`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe("UNAUTHENTICATED");
  });

  it("creates a task with contract defaults through a trusted origin", async () => {
    let received: unknown;
    const response = await request(
      testApp(undefined, {
        tasks: {
          createTask: async (_userId, boardId, input) => {
            received = { boardId, input };
            return { ...task, name: input.name };
          },
        },
      }),
    )
      .post(`/api/v1/boards/${summary.id}/tasks`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "  New task  " });
    expect(response.status).toBe(201);
    expect(received).toEqual({
      boardId: summary.id,
      input: { name: "New task", status: "NOT_STARTED", priority: "MEDIUM" },
    });
    expect(response.body.name).toBe("New task");
  });

  it("rejects an untrusted, anonymous, or invalid task creation", async () => {
    const untrusted = await request(testApp())
      .post(`/api/v1/boards/${summary.id}/tasks`)
      .set("x-user", "user-1")
      .send({ name: "New task" });
    const anonymous = await request(testApp())
      .post(`/api/v1/boards/${summary.id}/tasks`)
      .set("Origin", "http://localhost:8080")
      .send({ name: "New task" });
    const invalid = await request(testApp())
      .post(`/api/v1/boards/${summary.id}/tasks`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: "", status: "ARCHIVED" });
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(anonymous.status).toBe(401);
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("VALIDATION_ERROR");
  });

  it("moves a task with its current version and reports a stale move", async () => {
    let received: unknown;
    const response = await request(
      testApp(undefined, {
        tasks: {
          updateTask: async (_userId, taskId, input) => {
            received = { taskId, input };
            return { ...task, status: input.status, version: input.version + 1 };
          },
        },
      }),
    )
      .patch(`/api/v1/tasks/${task.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: task.name, status: "IN_PROGRESS", priority: "HIGH", version: 1 });
    expect(response.status).toBe(200);
    expect(received).toEqual({
      taskId: task.id,
      input: { name: task.name, status: "IN_PROGRESS", priority: "HIGH", version: 1 },
    });
    expect(response.body).toMatchObject({ status: "IN_PROGRESS", version: 2 });

    const stale = await request(
      testApp(undefined, {
        tasks: {
          updateTask: async () => {
            throw new HttpError(
              409,
              "TASK_VERSION_CONFLICT",
              "The task was changed by someone else.",
            );
          },
        },
      }),
    )
      .patch(`/api/v1/tasks/${task.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: task.name, status: "COMPLETED", priority: "LOW", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("TASK_VERSION_CONFLICT");

    const malformed = await request(testApp())
      .patch("/api/v1/tasks/not-a-uuid")
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080")
      .send({ name: task.name, status: "IN_PROGRESS", priority: "HIGH", version: 1 });
    expect(malformed.status).toBe(400);
  });

  it("deletes a task only with an explicit version", async () => {
    let received: unknown;
    const deleted = await request(
      testApp(undefined, {
        tasks: {
          deleteTask: async (_userId, taskId, version) => {
            received = { taskId, version };
          },
        },
      }),
    )
      .delete(`/api/v1/tasks/${task.id}?version=3`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080");
    expect(deleted.status).toBe(204);
    expect(received).toEqual({ taskId: task.id, version: 3 });

    const missingVersion = await request(testApp())
      .delete(`/api/v1/tasks/${task.id}`)
      .set("x-user", "user-1")
      .set("Origin", "http://localhost:8080");
    expect(missingVersion.status).toBe(400);
    expect(missingVersion.body.code).toBe("VALIDATION_ERROR");

    const untrusted = await request(testApp())
      .delete(`/api/v1/tasks/${task.id}?version=3`)
      .set("x-user", "user-1");
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("maps task authorization failures without leaking internals", async () => {
    const response = await request(
      testApp(undefined, {
        tasks: {
          getTask: async () => {
            throw new HttpError(404, "TASK_NOT_FOUND", "The task was not found.");
          },
        },
      }),
    )
      .get("/api/v1/tasks/01900000-0000-7000-8000-000000000404")
      .set("x-user", "user-1");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("TASK_NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });
});
