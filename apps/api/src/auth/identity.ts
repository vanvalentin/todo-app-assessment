import { randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

export function generateUuid(): string {
  return uuidv7();
}

export function generateAvatarSeed(): string {
  return randomBytes(16).toString("hex");
}
