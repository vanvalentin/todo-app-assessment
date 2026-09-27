import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/openapi.js";

describe("application OpenAPI", () => {
  it("publishes the phase 3 and phase 4a operations with shared response schemas", () => {
    const document = buildOpenApiDocument();
    expect({
      openapi: document.openapi,
      paths: Object.keys(document.paths ?? {}).sort(),
      schemas: Object.keys(document.components?.schemas ?? {}).sort(),
    }).toMatchInlineSnapshot(`
      {
        "openapi": "3.1.0",
        "paths": [
          "/api/v1/boards",
          "/api/v1/boards/{boardId}",
          "/api/v1/boards/{boardId}/invitations",
          "/api/v1/boards/{boardId}/invitations/{invitationId}",
          "/api/v1/boards/{boardId}/members",
          "/api/v1/boards/{boardId}/tasks",
          "/api/v1/invitations/{token}",
          "/api/v1/invitations/{token}/accept",
          "/api/v1/tasks/{taskId}",
          "/api/v1/tasks/{taskId}/attachments",
          "/api/v1/tasks/{taskId}/attachments/{attachmentId}",
          "/api/v1/tasks/{taskId}/attachments/{attachmentId}/content",
        ],
        "schemas": [
          "AcceptInvitationResponse",
          "Attachment",
          "AttachmentListResponse",
          "BoardDetail",
          "BoardListResponse",
          "BoardMemberListResponse",
          "BoardRole",
          "BoardSummary",
          "CreateBoardRequest",
          "CreateInvitationRequest",
          "CreateInvitationResponse",
          "CreateTaskRequest",
          "InvitationPreview",
          "PendingInvitationListResponse",
          "ProblemDetails",
          "Task",
          "TaskListResponse",
          "TaskPriority",
          "TaskReference",
          "UpdateBoardRequest",
          "UpdateTaskRequest",
        ],
      }
    `);
    const boardsPath = document.paths?.["/api/v1/boards"];
    expect(boardsPath?.post?.requestBody).toBeDefined();
    expect(Object.keys(boardsPath?.post?.responses ?? {}).sort()).toEqual([
      "201",
      "400",
      "401",
      "403",
      "429",
    ]);
    const boardPath = document.paths?.["/api/v1/boards/{boardId}"];
    expect(boardPath?.patch).toBeDefined();
    expect(boardPath?.patch?.requestBody).toBeDefined();
    expect(Object.keys(boardPath?.patch?.responses ?? {}).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "409",
    ]);
    const invitationPath = document.paths?.["/api/v1/boards/{boardId}/invitations/{invitationId}"];
    expect(Object.keys(invitationPath?.delete?.responses ?? {}).sort()).toEqual([
      "204",
      "400",
      "401",
      "403",
      "404",
      "409",
      "429",
    ]);
    const boardTasksPath = document.paths?.["/api/v1/boards/{boardId}/tasks"];
    expect(boardTasksPath?.get?.responses?.["200"]).toBeDefined();
    const taskListParamNames = (boardTasksPath?.get?.parameters ?? [])
      .map((parameter) => ("name" in parameter ? parameter.name : undefined))
      .filter((name): name is string => typeof name === "string");
    expect(taskListParamNames).toEqual(
      expect.arrayContaining([
        "q",
        "assignee",
        "priority",
        "status",
        "includeArchived",
        "due",
        "today",
        "sort",
      ]),
    );
    expect(boardTasksPath?.post?.requestBody).toBeDefined();
    expect(boardTasksPath?.post?.responses?.["422"]?.description).toContain(
      "TASK_DEPENDENCIES_INCOMPLETE",
    );
    expect(Object.keys(boardTasksPath?.post?.responses ?? {}).sort()).toEqual([
      "201",
      "400",
      "401",
      "403",
      "404",
      "422",
      "429",
    ]);
    const taskPath = document.paths?.["/api/v1/tasks/{taskId}"];
    expect(taskPath?.patch?.requestBody).toBeDefined();
    expect(taskPath?.patch?.responses?.["422"]?.description).toContain(
      "TASK_DEPENDENCIES_INCOMPLETE",
    );
    expect(Object.keys(taskPath?.patch?.responses ?? {}).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "409",
      "422",
      "429",
    ]);
    expect(Object.keys(taskPath?.delete?.responses ?? {}).sort()).toEqual([
      "204",
      "400",
      "401",
      "403",
      "404",
      "409",
      "429",
    ]);
    expect(taskPath?.get?.responses?.["404"]).toBeDefined();
    expect(document.info.description).toContain("Better Auth");
  });
});
