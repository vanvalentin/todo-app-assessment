import {
  acceptInvitationResponseSchema,
  createInvitationResponseSchema,
  invitationPreviewSchema,
  pendingInvitationListResponseSchema,
  type CreateInvitationRequest,
} from "@ksat/contracts";
import { apiRequest, apiRequestNoContent } from "./client";

const MAX_PAGE_SIZE = 100;

export function fetchPendingInvitations(
  boardId: string,
  options: { cursor?: string | null; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams({ limit: String(MAX_PAGE_SIZE) });
  if (options.cursor !== undefined && options.cursor !== null) params.set("cursor", options.cursor);
  return apiRequest(
    `/api/v1/boards/${encodeURIComponent(boardId)}/invitations?${params.toString()}`,
    pendingInvitationListResponseSchema,
    { signal: options.signal },
  );
}

export function createInvitation(boardId: string, body: CreateInvitationRequest) {
  return apiRequest(
    `/api/v1/boards/${encodeURIComponent(boardId)}/invitations`,
    createInvitationResponseSchema,
    { method: "POST", body },
  );
}

export function revokeInvitation(boardId: string, invitationId: string) {
  return apiRequestNoContent(
    `/api/v1/boards/${encodeURIComponent(boardId)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export function fetchInvitationPreview(token: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/invitations/${encodeURIComponent(token)}`, invitationPreviewSchema, {
    signal,
  });
}

export function acceptInvitation(token: string) {
  return apiRequest(
    `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
    acceptInvitationResponseSchema,
    { method: "POST" },
  );
}
