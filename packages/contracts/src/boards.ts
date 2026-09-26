import { z } from "zod";
import { isoTimestampSchema, userPreviewSchema, uuidSchema } from "./common.js";
import { paginatedResponseSchema } from "./pagination.js";

/** Board membership roles, most to least privileged. */
export const boardRoleSchema = z.enum(["ADMIN", "MANAGER", "CONTRIBUTOR"]);
export type BoardRole = z.infer<typeof boardRoleSchema>;

/** A board as shown to a member: their role plus a bounded member preview. */
export const boardSummarySchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1),
    description: z.string().nullable(),
    ownerId: uuidSchema,
    role: boardRoleSchema,
    memberCount: z.number().int().nonnegative(),
    memberPreview: z.array(userPreviewSchema),
    version: z.number().int().nonnegative(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type BoardSummary = z.infer<typeof boardSummarySchema>;

export const boardListResponseSchema = paginatedResponseSchema(boardSummarySchema);
export const createBoardRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z
      .string()
      .trim()
      .max(2000)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
  })
  .strict();
export type CreateBoardRequest = z.infer<typeof createBoardRequestSchema>;

export const updateBoardRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z
      .string()
      .trim()
      .max(2000)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateBoardRequest = z.infer<typeof updateBoardRequestSchema>;
export type BoardListResponse = z.infer<typeof boardListResponseSchema>;

/** Single-board detail shares the summary shape; endpoints may extend it later. */
export const boardDetailSchema = boardSummarySchema;
export type BoardDetail = z.infer<typeof boardDetailSchema>;

/** A board membership row joined with the member's public preview plus email. */
export const boardMemberSchema = z
  .object({
    userId: uuidSchema,
    boardId: uuidSchema,
    role: boardRoleSchema,
    joinedAt: isoTimestampSchema,
    user: userPreviewSchema.extend({ email: z.string().email() }),
  })
  .strict();
export type BoardMember = z.infer<typeof boardMemberSchema>;

export const boardMemberListResponseSchema = paginatedResponseSchema(boardMemberSchema);
export type BoardMemberListResponse = z.infer<typeof boardMemberListResponseSchema>;
