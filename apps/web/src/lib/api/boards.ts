import {
  boardDetailSchema,
  boardListResponseSchema,
  createBoardRequestSchema,
  boardMemberListResponseSchema,
  updateBoardRequestSchema,
  type CreateBoardRequest,
  type UpdateBoardRequest,
} from "@ksat/contracts";
import { apiRequest } from "./client";

/** The API caps a page at 100 items; the roster asks for a full first page. */
const MAX_PAGE_SIZE = 100;

function pageQuery(cursor: string | null | undefined, limit?: number): string {
  const params = new URLSearchParams();
  if (cursor !== undefined && cursor !== null) params.set("cursor", cursor);
  if (limit !== undefined) params.set("limit", String(limit));
  const search = params.toString();
  return search.length === 0 ? "" : `?${search}`;
}

export function fetchBoards(options: { cursor?: string | null; signal?: AbortSignal } = {}) {
  return apiRequest(`/api/v1/boards${pageQuery(options.cursor)}`, boardListResponseSchema, {
    signal: options.signal,
  });
}

export function createBoard(input: CreateBoardRequest, signal?: AbortSignal) {
  return apiRequest("/api/v1/boards", boardDetailSchema, {
    method: "POST",
    body: createBoardRequestSchema.parse(input),
    signal,
  });
}

export function updateBoard(boardId: string, input: UpdateBoardRequest, signal?: AbortSignal) {
  return apiRequest("/api/v1/boards/" + encodeURIComponent(boardId), boardDetailSchema, {
    method: "PATCH",
    body: updateBoardRequestSchema.parse(input),
    signal,
  });
}

export function fetchBoard(boardId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/boards/${encodeURIComponent(boardId)}`, boardDetailSchema, { signal });
}

export function fetchBoardMembers(
  boardId: string,
  options: { cursor?: string | null; signal?: AbortSignal } = {},
) {
  return apiRequest(
    `/api/v1/boards/${encodeURIComponent(boardId)}/members${pageQuery(options.cursor, MAX_PAGE_SIZE)}`,
    boardMemberListResponseSchema,
    { signal: options.signal },
  );
}
