import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
extendZodWithOpenApi(z);
import {
  acceptInvitationResponseSchema,
  boardDetailSchema,
  boardListResponseSchema,
  boardMemberListResponseSchema,
  boardRoleSchema,
  boardSummarySchema,
  createBoardRequestSchema,
  createInvitationRequestSchema,
  updateBoardRequestSchema,
  createInvitationResponseSchema,
  createTaskRequestSchema,
  deleteTaskQuerySchema,
  invitationPreviewSchema,
  paginationQuerySchema,
  pendingInvitationListResponseSchema,
  problemDetailsSchema,
  taskListResponseSchema,
  taskPrioritySchema,
  taskSchema,
  updateTaskRequestSchema,
} from "@ksat/contracts";
const json = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const problem = { content: { "application/problem+json": { schema: problemDetailsSchema } } };
const boardParamSchema = z.object({ boardId: z.string().uuid() }).strict();
const taskParamSchema = z.object({ taskId: z.string().uuid() }).strict();
const tokenParamSchema = z.object({ token: z.string() }).strict();
export type OpenApiDocument = ReturnType<OpenApiGeneratorV31["generateDocument"]>;
export function buildOpenApiDocument(): OpenApiDocument {
  const registry = new OpenAPIRegistry();
  registry.register("BoardRole", boardRoleSchema);
  registry.register("BoardSummary", boardSummarySchema);
  registry.register("BoardDetail", boardDetailSchema);
  registry.register("BoardListResponse", boardListResponseSchema);
  registry.register("BoardMemberListResponse", boardMemberListResponseSchema);
  registry.register("CreateBoardRequest", createBoardRequestSchema);
  registry.register("CreateInvitationRequest", createInvitationRequestSchema);
  registry.register("UpdateBoardRequest", updateBoardRequestSchema);
  registry.register("CreateInvitationResponse", createInvitationResponseSchema);
  registry.register("PendingInvitationListResponse", pendingInvitationListResponseSchema);
  registry.register("InvitationPreview", invitationPreviewSchema);
  registry.register("AcceptInvitationResponse", acceptInvitationResponseSchema);
  registry.register("ProblemDetails", problemDetailsSchema);
  registry.register("TaskPriority", taskPrioritySchema);
  registry.register("Task", taskSchema);
  registry.register("TaskListResponse", taskListResponseSchema);
  registry.register("CreateTaskRequest", createTaskRequestSchema);
  registry.register("UpdateTaskRequest", updateTaskRequestSchema);
  registry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/boards",
    security: [{ cookieAuth: [] }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: createBoardRequestSchema } },
      },
    },
    responses: {
      201: {
        description: "New board owned and administered by the caller.",
        ...json(boardDetailSchema),
      },
      400: { description: "Invalid board creation request.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin required.", ...problem },
      429: { description: "Board creation rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/boards",
    security: [{ cookieAuth: [] }],
    request: { query: paginationQuerySchema },
    responses: {
      200: {
        description: "Boards visible to the signed-in member.",
        ...json(boardListResponseSchema),
      },
      401: { description: "Unauthenticated.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/boards/{boardId}",
    security: [{ cookieAuth: [] }],
    request: { params: boardParamSchema },
    responses: {
      200: { description: "Board detail.", ...json(boardDetailSchema) },
      400: { description: "Malformed board id.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
    },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/boards/{boardId}",
    security: [{ cookieAuth: [] }],
    request: {
      params: boardParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateBoardRequestSchema } },
      },
    },
    responses: {
      200: { description: "Updated board detail.", ...json(boardDetailSchema) },
      400: { description: "Invalid board id or update request.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin or admin role required.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
      409: { description: "Board version is stale.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/boards/{boardId}/members",
    security: [{ cookieAuth: [] }],
    request: { params: boardParamSchema, query: paginationQuerySchema },
    responses: {
      200: { description: "Board members.", ...json(boardMemberListResponseSchema) },
      401: { description: "Unauthenticated.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/boards/{boardId}/invitations",
    security: [{ cookieAuth: [] }],
    request: { params: boardParamSchema, query: paginationQuerySchema },
    responses: {
      200: { description: "Pending invitations.", ...json(pendingInvitationListResponseSchema) },
      403: { description: "Manager or admin role required.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/boards/{boardId}/invitations",
    security: [{ cookieAuth: [] }],
    request: {
      params: boardParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: createInvitationRequestSchema } },
      },
    },
    responses: {
      201: {
        description: "Invitation created; token is delivered by email only.",
        ...json(createInvitationResponseSchema),
      },
      400: { description: "Invalid request.", ...problem },
      403: { description: "Insufficient role or untrusted origin.", ...problem },
      409: { description: "Already a member or concurrent invitation conflict.", ...problem },
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/v1/boards/{boardId}/invitations/{invitationId}",
    security: [{ cookieAuth: [] }],
    request: {
      params: z.object({ boardId: z.string().uuid(), invitationId: z.string().uuid() }).strict(),
    },
    responses: {
      204: { description: "Invitation cancelled or already cancelled." },
      400: { description: "Malformed board or invitation id.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin or sufficient board role required.", ...problem },
      404: { description: "Board membership or invitation not found.", ...problem },
      409: { description: "Invitation was accepted or changed concurrently.", ...problem },
      429: { description: "Cancellation rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/invitations/{token}",
    request: { params: tokenParamSchema },
    responses: {
      200: { description: "Invitation preview.", ...json(invitationPreviewSchema) },
      404: { description: "Invitation not found.", ...problem },
      410: { description: "Invitation expired or unavailable.", ...problem },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/invitations/{token}/accept",
    security: [{ cookieAuth: [] }],
    request: { params: tokenParamSchema },
    responses: {
      200: { description: "Invitation accepted.", ...json(acceptInvitationResponseSchema) },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Signed-in email does not match.", ...problem },
      410: { description: "Invitation expired or unavailable.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/boards/{boardId}/tasks",
    security: [{ cookieAuth: [] }],
    request: { params: boardParamSchema, query: paginationQuerySchema },
    responses: {
      200: {
        description: "Active board tasks; ARCHIVED tasks are excluded.",
        ...json(taskListResponseSchema),
      },
      400: { description: "Malformed board id or pagination query.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/boards/{boardId}/tasks",
    security: [{ cookieAuth: [] }],
    request: {
      params: boardParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: createTaskRequestSchema } },
      },
    },
    responses: {
      201: { description: "Created task.", ...json(taskSchema) },
      400: { description: "Invalid board id or task creation request.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin required.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
      429: { description: "Task creation rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/tasks/{taskId}",
    security: [{ cookieAuth: [] }],
    request: { params: taskParamSchema },
    responses: {
      200: { description: "Task detail.", ...json(taskSchema) },
      400: { description: "Malformed task id.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      404: { description: "Task is unknown or the caller is not a board member.", ...problem },
    },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/tasks/{taskId}",
    security: [{ cookieAuth: [] }],
    request: {
      params: taskParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateTaskRequestSchema } },
      },
    },
    responses: {
      200: { description: "Updated task, including a status move.", ...json(taskSchema) },
      400: { description: "Invalid task id or update request.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin required.", ...problem },
      404: { description: "Task is unknown or the caller is not a board member.", ...problem },
      409: { description: "Task version is stale.", ...problem },
      429: { description: "Task update rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/v1/tasks/{taskId}",
    security: [{ cookieAuth: [] }],
    request: { params: taskParamSchema, query: deleteTaskQuerySchema },
    responses: {
      204: { description: "Task deleted." },
      400: { description: "Malformed task id or missing/invalid version.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin required.", ...problem },
      404: { description: "Task is unknown or the caller is not a board member.", ...problem },
      409: { description: "Task version is stale.", ...problem },
      429: { description: "Task deletion rate limit exceeded.", ...problem },
    },
  });
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Ksat application API",
      version: "0.1.0",
      description:
        "Boards and membership API. Authentication routes are owned by Better Auth; see https://www.better-auth.com/docs for its route reference.",
    },
    servers: [{ url: "/" }],
  });
}
