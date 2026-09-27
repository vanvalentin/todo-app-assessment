import { taskSortSchema, type TaskSort } from "@ksat/contracts";
import { z } from "zod";

/**
 * Opaque, base64url-encoded keyset cursor for the task board list. Unlike the
 * generic board/invitation cursor, the sort key here varies by mode (a calendar
 * date, a priority, a timestamp, or a name), so it gets its own codec rather than
 * reusing lib/cursor.ts's timestamp-shaped payload.
 */
const taskCursorPayloadSchema = z
  .object({
    /** The sort the cursor was produced under; a mismatch is always rejected. */
    s: taskSortSchema,
    /** Serialized sort key of the last row on the page, or null for the "no value" group. */
    k: z.union([z.string(), z.null()]),
    /** The last row's board sequence number: a total-order tiebreaker within equal keys. */
    n: z.number().int().positive(),
  })
  .strict();

export type TaskCursorPayload = z.infer<typeof taskCursorPayloadSchema>;

export function encodeTaskCursor(payload: TaskCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeTaskCursor(cursor: string): TaskCursorPayload | undefined {
  let json: string;
  try {
    json = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const result = taskCursorPayloadSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

/** True once a task-sort cursor's own sort no longer matches the requested one. */
export function taskCursorSortMismatch(cursor: TaskCursorPayload, sort: TaskSort): boolean {
  return cursor.s !== sort;
}
