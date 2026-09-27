import {
  attachmentListResponseSchema,
  attachmentSchema,
  type AttachmentListQuery,
} from "@ksat/contracts";
import { apiRequest, apiRequestNoContent } from "./client";
export function fetchTaskAttachments(taskId: string, query: AttachmentListQuery = { limit: 50 }) {
  const params = new URLSearchParams({ limit: String(query.limit ?? 50) });
  if (query.cursor) params.set("cursor", query.cursor);
  return apiRequest(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments?${params.toString()}`,
    attachmentListResponseSchema,
  );
}
export function uploadTaskAttachment(taskId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest(`/api/v1/tasks/${encodeURIComponent(taskId)}/attachments`, attachmentSchema, {
    method: "POST",
    body,
  });
}
export function attachmentContentUrl(taskId: string, attachmentId: string): string {
  return `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}/content`;
}
export function deleteTaskAttachment(taskId: string, attachmentId: string) {
  return apiRequestNoContent(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
}
