import { uuidSchema } from "@ksat/contracts";

/**
 * Opaque, base64url-encoded keyset pagination cursor. Callers never construct
 * or interpret this payload; encode/decode are the only supported operations.
 */
export interface CursorPayload {
  /** Serialized sort key (e.g. an ISO timestamp) of the last row on the page. */
  readonly k: string;
  /** Tiebreaker id of the last row on the page, for a total order. */
  readonly id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | undefined {
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
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "k" in parsed &&
    "id" in parsed &&
    typeof (parsed as { k: unknown }).k === "string" &&
    typeof (parsed as { id: unknown }).id === "string"
  ) {
    const key = (parsed as { k: string }).k;
    const id = (parsed as { id: string }).id;
    if (!Number.isFinite(new Date(key).getTime()) || !uuidSchema.safeParse(id).success)
      return undefined;
    return { k: key, id };
  }
  return undefined;
}
