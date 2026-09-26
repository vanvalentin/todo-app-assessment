import { describe, expect, it } from "vitest";
import { paginatedResponseSchema, paginationQuerySchema } from "./pagination.js";
import { z } from "zod";

describe("pagination contracts", () => {
  it("defaults the page size and bounds it to 1..100", () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(50);
    expect(paginationQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(paginationQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("builds an items/nextCursor response schema for an arbitrary item", () => {
    const schema = paginatedResponseSchema(z.object({ id: z.string() }).strict());
    expect(schema.parse({ items: [{ id: "a" }], nextCursor: "xyz" }).nextCursor).toBe("xyz");
    expect(schema.parse({ items: [], nextCursor: null }).nextCursor).toBeNull();
  });
});
