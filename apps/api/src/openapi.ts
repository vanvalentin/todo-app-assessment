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
  livenessResponseSchema,
  paginationQuerySchema,
  readinessResponseSchema,
  pendingInvitationListResponseSchema,
  problemDetailsSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskPrioritySchema,
  taskReferenceSchema,
  taskSchema,
  updateTaskRequestSchema,
  attachmentSchema,
  attachmentListResponseSchema,
  attachmentListQuerySchema,
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
  registry.register("LivenessResponse", livenessResponseSchema);
  registry.register("ReadinessResponse", readinessResponseSchema);
  registry.register("TaskPriority", taskPrioritySchema);
  registry.register("TaskReference", taskReferenceSchema);
  registry.register("Task", taskSchema);
  registry.register("TaskListResponse", taskListResponseSchema);
  registry.register("CreateTaskRequest", createTaskRequestSchema);
  registry.register("UpdateTaskRequest", updateTaskRequestSchema);
  registry.register("Attachment", attachmentSchema);
  registry.register("AttachmentListResponse", attachmentListResponseSchema);
  registry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
  });
  registry.registerPath({
    method: "get",
    path: "/health/live",
    tags: ["Health"],
    responses: {
      200: { description: "The API process is alive.", ...json(livenessResponseSchema) },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/health/ready",
    tags: ["Health"],
    responses: {
      200: {
        description: "All required dependencies are ready.",
        ...json(readinessResponseSchema),
      },
      503: {
        description: "At least one required dependency is unavailable.",
        ...json(readinessResponseSchema),
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/boards",
    tags: ["Boards"],
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
    tags: ["Boards"],
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
    tags: ["Boards"],
    security: [{ cookieAuth: [] }],
    request: { params: boardParamSchema },
    responses: {
      200: { description: "Board detail.", ...json(boardDetailSchema) },
      400: { description: "Malformed board id.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
    },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/boards/{boardId}",
    tags: ["Boards"],
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
    tags: ["Members"],
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
    tags: ["Invitations"],
    security: [{ cookieAuth: [] }],
    request: { params: boardParamSchema, query: paginationQuerySchema },
    responses: {
      200: { description: "Pending invitations.", ...json(pendingInvitationListResponseSchema) },
      400: { description: "Invalid pagination cursor.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Manager or admin role required.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/boards/{boardId}/invitations",
    tags: ["Invitations"],
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
      401: { description: "Unauthenticated.", ...problem },
      403: {
        description: "Insufficient role, untrusted origin, or a non-admin inviting an admin.",
        ...problem,
      },
      404: { description: "Board is unknown or not a member.", ...problem },
      409: { description: "Already a member or concurrent invitation conflict.", ...problem },
      429: { description: "Invitation creation rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/v1/boards/{boardId}/invitations/{invitationId}",
    tags: ["Invitations"],
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
    tags: ["Invitations"],
    request: { params: tokenParamSchema },
    responses: {
      200: { description: "Invitation preview.", ...json(invitationPreviewSchema) },
      400: { description: "Malformed invitation token.", ...problem },
      404: { description: "Invitation not found.", ...problem },
      410: { description: "Invitation expired or unavailable.", ...problem },
      429: { description: "Invitation lookup rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/invitations/{token}/accept",
    tags: ["Invitations"],
    security: [{ cookieAuth: [] }],
    request: { params: tokenParamSchema },
    responses: {
      200: { description: "Invitation accepted.", ...json(acceptInvitationResponseSchema) },
      400: { description: "Malformed invitation token.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Signed-in email does not match, or untrusted origin.", ...problem },
      404: { description: "Invitation not found.", ...problem },
      410: { description: "Invitation expired or unavailable.", ...problem },
      429: { description: "Invitation acceptance rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/boards/{boardId}/tasks",
    tags: ["Tasks"],
    security: [{ cookieAuth: [] }],
    request: { params: boardParamSchema, query: taskListQuerySchema },
    responses: {
      200: {
        description:
          "Board tasks matching the search/filter/sort query. ARCHIVED tasks are excluded unless includeArchived=true.",
        ...json(taskListResponseSchema),
      },
      400: {
        description:
          "Malformed board id, an invalid query (including a due filter missing today), or a cursor from a different sort.",
        ...problem,
      },
      401: { description: "Unauthenticated.", ...problem },
      404: { description: "Board is unknown or not a member.", ...problem },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/boards/{boardId}/tasks",
    tags: ["Tasks"],
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
      422: {
        description:
          "Assignee is not an active board member (TASK_ASSIGNEE_NOT_MEMBER), a dependency is not a task on this board (TASK_DEPENDENCY_NOT_FOUND), or the task starts In Progress or Completed while a dependency is still Not Started or In Progress (TASK_DEPENDENCIES_INCOMPLETE).",
        ...problem,
      },
      429: { description: "Task creation rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/tasks/{taskId}",
    tags: ["Tasks"],
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
    tags: ["Tasks"],
    security: [{ cookieAuth: [] }],
    request: {
      params: taskParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateTaskRequestSchema } },
      },
    },
    responses: {
      200: {
        description:
          "Updated task, including a status move. The request is the full editable state: dependsOnIds replaces the prerequisite set.",
        ...json(taskSchema),
      },
      400: { description: "Invalid task id or update request.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin required.", ...problem },
      404: { description: "Task is unknown or the caller is not a board member.", ...problem },
      409: { description: "Task version is stale.", ...problem },
      422: {
        description:
          "Assignee is not an active board member, a dependency is not a task on this board (TASK_DEPENDENCY_NOT_FOUND), names the task itself (TASK_DEPENDENCY_SELF), would create a cycle (TASK_DEPENDENCY_CYCLE), or the task moves into In Progress or Completed while a dependency is still Not Started or In Progress (TASK_DEPENDENCIES_INCOMPLETE).",
        ...problem,
      },
      429: { description: "Task update rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/v1/tasks/{taskId}",
    tags: ["Tasks"],
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
  registry.registerPath({
    method: "get",
    path: "/api/v1/tasks/{taskId}/attachments",
    tags: ["Attachments"],
    security: [{ cookieAuth: [] }],
    request: { params: taskParamSchema, query: attachmentListQuerySchema },
    responses: {
      200: { description: "Task attachments.", ...json(attachmentListResponseSchema) },
      401: { description: "Unauthenticated.", ...problem },
      404: { description: "Task is unknown or inaccessible.", ...problem },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/tasks/{taskId}/attachments",
    tags: ["Attachments"],
    security: [{ cookieAuth: [] }],
    request: {
      params: taskParamSchema,
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({ file: z.string().openapi({ format: "binary" }) }).strict(),
          },
        },
      },
    },
    responses: {
      201: { description: "Uploaded attachment.", ...json(attachmentSchema) },
      400: { description: "Missing file.", ...problem },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin required.", ...problem },
      404: { description: "Task is unknown or inaccessible.", ...problem },
      413: {
        description: "Per-file or per-task attachment size limit exceeded.",
        ...problem,
      },
      415: { description: "Unsupported file type.", ...problem },
      422: { description: "File name or content is invalid or empty.", ...problem },
      429: { description: "Attachment upload rate limit exceeded.", ...problem },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/tasks/{taskId}/attachments/{attachmentId}/content",
    tags: ["Attachments"],
    security: [{ cookieAuth: [] }],
    request: {
      params: z.object({ taskId: z.string().uuid(), attachmentId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: "Private attachment bytes.",
        content: {
          "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) },
        },
      },
      401: { description: "Unauthenticated.", ...problem },
      404: { description: "Attachment is unknown or inaccessible.", ...problem },
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/v1/tasks/{taskId}/attachments/{attachmentId}",
    tags: ["Attachments"],
    security: [{ cookieAuth: [] }],
    request: {
      params: z.object({ taskId: z.string().uuid(), attachmentId: z.string().uuid() }).strict(),
    },
    responses: {
      204: { description: "Attachment deleted." },
      401: { description: "Unauthenticated.", ...problem },
      403: { description: "Trusted origin required.", ...problem },
      404: { description: "Attachment is unknown or inaccessible.", ...problem },
      429: { description: "Attachment deletion rate limit exceeded.", ...problem },
    },
  });
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    tags: [
      { name: "Health", description: "Service health endpoints." },
      { name: "Boards", description: "Board resources." },
      { name: "Members", description: "Board membership resources." },
      { name: "Invitations", description: "Invitation resources." },
      { name: "Tasks", description: "Task resources." },
      { name: "Attachments", description: "Task attachment resources." },
    ],
    info: {
      title: "Ksat application API",
      version: "0.1.0",
      description:
        "Boards, membership, and task API. Authentication routes are owned by Better Auth; see https://www.better-auth.com/docs for its route reference.",
    },
    servers: [{ url: "/" }],
  });
}
