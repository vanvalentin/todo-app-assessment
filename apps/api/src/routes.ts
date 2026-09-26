import express, { type Express, type Request } from "express";
import { z } from "zod";
import {
  createBoardRequestSchema,
  createInvitationRequestSchema,
  createTaskRequestSchema,
  deleteTaskQuerySchema,
  paginationQuerySchema,
  updateBoardRequestSchema,
  updateTaskRequestSchema,
  uuidSchema,
} from "@ksat/contracts";
import type { BoardsService } from "./modules/boards/boards.service.js";
import type { InvitationsService } from "./modules/invitations/invitations.service.js";
import type { TasksService } from "./modules/tasks/tasks.service.js";
import { requireSession, type ResolveSession, type ResolvedSession } from "./auth/session.js";
import { createOriginCheckMiddleware } from "./lib/originCheck.js";
import type { RateLimiter } from "./lib/rateLimiter.js";
import { HttpError } from "./errors.js";
export interface ApiRouteDeps {
  readonly boards: BoardsService;
  readonly invitations: InvitationsService;
  readonly tasks: TasksService;
  readonly resolveSession: ResolveSession;
  readonly rateLimiter: RateLimiter;
  readonly trustedOrigins: readonly string[];
}
/**
 * Parses input at the route boundary. The schema parameter accepts any input type
 * so a contract with defaults still infers its resolved output type.
 */
function parseOrThrow<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  input: unknown,
  detail = "The request is invalid.",
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new HttpError(
    400,
    "VALIDATION_ERROR",
    detail,
    parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "request",
      message: issue.message,
    })),
  );
}
function sessionOf(request: Request): ResolvedSession {
  if (!request.session) throw new HttpError(401, "UNAUTHENTICATED", "Sign in is required.");
  return request.session;
}
function ipOf(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}
async function enforceRateLimit(
  limiter: RateLimiter,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const result = await limiter.consume(key, limit, windowSeconds);
  if (!result.allowed)
    throw new HttpError(429, "RATE_LIMITED", "Too many requests. Try again later.");
}
function boardId(request: Request): string {
  return parseOrThrow(uuidSchema, request.params.boardId, "The board id is invalid.");
}
function invitationId(request: Request): string {
  return parseOrThrow(uuidSchema, request.params.invitationId, "The invitation id is invalid.");
}
function token(request: Request): string {
  return parseOrThrow(
    z.string().regex(/^[A-Za-z0-9_-]{43}$/, "The invitation token is invalid."),
    request.params.token,
    "The invitation token is invalid.",
  );
}
function taskId(request: Request): string {
  return parseOrThrow(uuidSchema, request.params.taskId, "The task id is invalid.");
}
/** DELETE carries the expected version as a query parameter because it has no body. */
function taskVersion(request: Request): number {
  return parseOrThrow(deleteTaskQuerySchema, request.query, "The task version query is invalid.")
    .version;
}
function pagination(request: Request): { readonly cursor?: string; readonly limit: number } {
  const parsed = parseOrThrow(
    paginationQuerySchema,
    request.query,
    "The pagination query is invalid.",
  );
  const limit = parsed.limit ?? 50;
  return parsed.cursor === undefined ? { limit } : { cursor: parsed.cursor, limit };
}
export function configureApiRoutes(app: Express, deps: ApiRouteDeps): void {
  const router = express.Router();
  const requireUser = requireSession(deps.resolveSession);
  const unsafeOrigin = createOriginCheckMiddleware(deps.trustedOrigins);
  router.post("/boards", unsafeOrigin, requireUser, async (request, response) => {
    const session = sessionOf(request);
    await enforceRateLimit(deps.rateLimiter, `board:create:${session.user.id}`, 20, 3_600);
    const body = parseOrThrow(
      createBoardRequestSchema,
      request.body,
      "The board creation request is invalid.",
    );
    response.status(201).json(await deps.boards.createBoard(session.user.id, body));
  });
  router.get("/boards", requireUser, async (request, response) => {
    response
      .status(200)
      .json(await deps.boards.listBoards(sessionOf(request).user.id, pagination(request)));
  });
  router.get("/boards/:boardId", requireUser, async (request, response) => {
    response
      .status(200)
      .json(await deps.boards.getBoard(sessionOf(request).user.id, boardId(request)));
  });
  router.patch("/boards/:boardId", unsafeOrigin, requireUser, async (request, response) => {
    const session = sessionOf(request);
    const body = parseOrThrow(
      updateBoardRequestSchema,
      request.body,
      "The board update request is invalid.",
    );
    response
      .status(200)
      .json(await deps.boards.updateBoard(session.user.id, boardId(request), body));
  });
  router.get("/boards/:boardId/members", requireUser, async (request, response) => {
    response
      .status(200)
      .json(
        await deps.boards.listMembers(
          sessionOf(request).user.id,
          boardId(request),
          pagination(request),
        ),
      );
  });
  router.get("/boards/:boardId/invitations", requireUser, async (request, response) => {
    response
      .status(200)
      .json(
        await deps.invitations.listPending(
          sessionOf(request).user.id,
          boardId(request),
          pagination(request),
        ),
      );
  });
  router.post(
    "/boards/:boardId/invitations",
    unsafeOrigin,
    requireUser,
    async (request, response) => {
      const session = sessionOf(request);
      await enforceRateLimit(deps.rateLimiter, `invite:create:${session.user.id}`, 10, 3_600);
      const body = parseOrThrow(
        createInvitationRequestSchema,
        request.body,
        "The invitation request is invalid.",
      );
      response
        .status(201)
        .json(
          await deps.invitations.create(session.user.id, boardId(request), body.email, body.role),
        );
    },
  );
  router.delete(
    "/boards/:boardId/invitations/:invitationId",
    unsafeOrigin,
    requireUser,
    async (request, response) => {
      const session = sessionOf(request);
      await enforceRateLimit(deps.rateLimiter, `invite:revoke:${session.user.id}`, 30, 3_600);
      await deps.invitations.revoke(session.user.id, boardId(request), invitationId(request));
      response.status(204).end();
    },
  );
  router.get("/invitations/:token", async (request, response) => {
    await enforceRateLimit(deps.rateLimiter, `invite:lookup:${ipOf(request)}`, 60, 60);
    response.status(200).json(await deps.invitations.preview(token(request)));
  });
  router.post(
    "/invitations/:token/accept",
    unsafeOrigin,
    requireUser,
    async (request, response) => {
      await enforceRateLimit(deps.rateLimiter, `invite:accept:${ipOf(request)}`, 30, 60);
      const session = sessionOf(request);
      response
        .status(200)
        .json(await deps.invitations.accept(token(request), session.user.id, session.user.email));
    },
  );
  router.get("/boards/:boardId/tasks", requireUser, async (request, response) => {
    response
      .status(200)
      .json(
        await deps.tasks.listTasks(
          sessionOf(request).user.id,
          boardId(request),
          pagination(request),
        ),
      );
  });
  router.post("/boards/:boardId/tasks", unsafeOrigin, requireUser, async (request, response) => {
    const session = sessionOf(request);
    await enforceRateLimit(deps.rateLimiter, `task:create:${session.user.id}`, 120, 3_600);
    const body = parseOrThrow(
      createTaskRequestSchema,
      request.body,
      "The task creation request is invalid.",
    );
    response.status(201).json(await deps.tasks.createTask(session.user.id, boardId(request), body));
  });
  router.get("/tasks/:taskId", requireUser, async (request, response) => {
    response
      .status(200)
      .json(await deps.tasks.getTask(sessionOf(request).user.id, taskId(request)));
  });
  router.patch("/tasks/:taskId", unsafeOrigin, requireUser, async (request, response) => {
    const session = sessionOf(request);
    await enforceRateLimit(deps.rateLimiter, `task:update:${session.user.id}`, 600, 3_600);
    const body = parseOrThrow(
      updateTaskRequestSchema,
      request.body,
      "The task update request is invalid.",
    );
    response.status(200).json(await deps.tasks.updateTask(session.user.id, taskId(request), body));
  });
  router.delete("/tasks/:taskId", unsafeOrigin, requireUser, async (request, response) => {
    const session = sessionOf(request);
    await enforceRateLimit(deps.rateLimiter, `task:delete:${session.user.id}`, 120, 3_600);
    await deps.tasks.deleteTask(session.user.id, taskId(request), taskVersion(request));
    response.status(204).end();
  });
  app.use("/api/v1", router);
}
