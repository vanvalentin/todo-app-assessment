import { z } from "zod";

/** Shared keyset-pagination query shape: opaque cursor plus a bounded page size. */
export const paginationQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Builds a `{ items, nextCursor }` response schema for a given item schema. */
export function paginatedResponseSchema<ItemSchema extends z.ZodTypeAny>(itemSchema: ItemSchema) {
  return z
    .object({
      items: z.array(itemSchema),
      nextCursor: z.string().min(1).nullable(),
    })
    .strict();
}
