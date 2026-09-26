import { createHash, randomBytes } from "node:crypto";

/** A fresh, high-entropy invitation token. Only its hash is ever persisted. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hash of an invitation token, stored instead of the plain value. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
