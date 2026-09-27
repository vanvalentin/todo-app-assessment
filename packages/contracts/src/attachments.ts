import { z } from "zod";
import { isoTimestampSchema, userPreviewSchema, uuidSchema } from "./common.js";
import { paginatedResponseSchema, paginationQuerySchema } from "./pagination.js";

export const ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_TASK_BYTES = 50 * 1024 * 1024;
export const attachmentMediaTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);
export type AttachmentMediaType = z.infer<typeof attachmentMediaTypeSchema>;

export const attachmentSchema = z
  .object({
    id: uuidSchema,
    taskId: uuidSchema,
    originalFilename: z.string().min(1).max(255),
    mediaType: attachmentMediaTypeSchema,
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    uploader: userPreviewSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type Attachment = z.infer<typeof attachmentSchema>;
export const attachmentListResponseSchema = paginatedResponseSchema(attachmentSchema);
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>;
export const attachmentListQuerySchema = paginationQuerySchema;
export type AttachmentListQuery = z.infer<typeof attachmentListQuerySchema>;
