import { hash, verify } from "@node-rs/argon2";

/** OWASP-aligned Argon2id baseline for interactive password authentication. */
export const argon2Options = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
  version: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, argon2Options);
}

export function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  return verify(data.hash, data.password, argon2Options);
}
