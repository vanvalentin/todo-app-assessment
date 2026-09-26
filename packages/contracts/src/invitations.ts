import { z } from "zod";
import { boardRoleSchema } from "./boards.js";
import { isoTimestampSchema, userPreviewSchema, uuidSchema } from "./common.js";
import { paginatedResponseSchema } from "./pagination.js";

/** Whether the invitation email was successfully handed to the SMTP transport. */
export const emailDeliveryStatusSchema = z.enum(["SENT", "FAILED"]);
export type EmailDeliveryStatus = z.infer<typeof emailDeliveryStatusSchema>;

export const createInvitationRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    role: boardRoleSchema,
  })
  .strict();
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/** The plain invitation token is never returned by the API. */
export const createInvitationResponseSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    email: z.string().email(),
    role: boardRoleSchema,
    invitedById: uuidSchema,
    expiresAt: isoTimestampSchema,
    createdAt: isoTimestampSchema,
    emailDelivery: emailDeliveryStatusSchema,
  })
  .strict();
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

export const pendingInvitationSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    email: z.string().email(),
    role: boardRoleSchema,
    invitedBy: userPreviewSchema,
    expiresAt: isoTimestampSchema,
    createdAt: isoTimestampSchema,
  })
  .strict();
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;

export const pendingInvitationListResponseSchema = paginatedResponseSchema(pendingInvitationSchema);
export type PendingInvitationListResponse = z.infer<typeof pendingInvitationListResponseSchema>;

/** Preview shown before accepting; never includes the token or its hash. */
export const invitationPreviewSchema = z
  .object({
    boardId: uuidSchema,
    boardName: z.string().min(1),
    email: z.string().email(),
    role: boardRoleSchema,
    invitedBy: userPreviewSchema,
    expiresAt: isoTimestampSchema,
  })
  .strict();
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const acceptInvitationResponseSchema = z
  .object({
    boardId: uuidSchema,
    boardName: z.string().min(1),
    role: boardRoleSchema,
    joinedAt: isoTimestampSchema,
    alreadyMember: z.boolean(),
  })
  .strict();
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;
