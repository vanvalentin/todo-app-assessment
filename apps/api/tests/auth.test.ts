import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { toNodeHandler } from "better-auth/node";
import { createApp } from "../src/app.js";
import { createBetterAuth } from "../src/auth/config.js";
import { generateAvatarSeed, generateUuid } from "../src/auth/identity.js";
import { argon2Options, hashPassword, verifyPassword } from "../src/auth/password.js";
import { createResilientSecondaryStorage, type RedisStorageClient } from "../src/auth/storage.js";
import { parseEnvironment } from "../src/config/env.js";

class FailingRedis implements RedisStorageClient {
  async get(): Promise<string | null> {
    throw new Error("redis unavailable");
  }

  async getAndDelete(): Promise<string | null> {
    throw new Error("redis unavailable");
  }

  async increment(): Promise<number> {
    throw new Error("redis unavailable");
  }

  async set(): Promise<unknown> {
    throw new Error("redis unavailable");
  }

  async del(): Promise<unknown> {
    throw new Error("redis unavailable");
  }
}

describe("identity security primitives", () => {
  it("uses explicit Argon2id parameters and rejects a mismatched password", async () => {
    expect(argon2Options).toMatchObject({
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
      version: 1,
    });

    const password = "a-long-test-password-that-is-not-a-secret";
    const encoded = await hashPassword(password);
    expect(encoded.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword({ hash: encoded, password })).resolves.toBe(true);
    await expect(verifyPassword({ hash: encoded, password: "a-different-password" })).resolves.toBe(
      false,
    );
  }, 15_000);

  it("generates UUIDv7 IDs and opaque server-side avatar seeds", () => {
    const id = generateUuid();
    const seed = generateAvatarSeed();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
    expect(seed).not.toContain("client");
  });

  it("falls back without authenticating from a failed Redis read", async () => {
    const storage = createResilientSecondaryStorage(new FailingRedis());

    await expect(storage.get("missing-session")).resolves.toBeNull();
    await expect(
      storage.set("session", JSON.stringify({ session: "value" }), 30),
    ).resolves.toBeUndefined();
    await expect(storage.get("session")).resolves.toBeNull();
    await expect(
      storage.set(
        "rate-limit",
        JSON.stringify({ key: "rate-limit", count: 1, lastRequest: Date.now() }),
        30,
      ),
    ).resolves.toBeUndefined();
    await expect(storage.get("rate-limit")).resolves.toContain('"count":1');
    await expect(storage.increment("counter", 30)).resolves.toBe(1);
    await expect(storage.increment("counter", 30)).resolves.toBe(2);
    await expect(storage.getAndDelete("counter")).resolves.toBe("2");
    await expect(storage.get("counter")).resolves.toBeNull();
    await expect(storage.delete("rate-limit")).resolves.toBeUndefined();
    await expect(storage.get("rate-limit")).resolves.toBeNull();
  });

  it("returns the same bad-credential response for unknown and wrong-password users", async () => {
    const database: Record<string, never[]> = {
      user: [],
      account: [],
      session: [],
      verification: [],
    };
    const auth = betterAuth({
      baseURL: "http://localhost:3000",
      basePath: "/api/v1/auth",
      secret: "test-only-better-auth-secret-that-is-long-enough",
      database: memoryAdapter(database),
      trustedOrigins: ["http://localhost:3000"],
      logger: { disabled: true },
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        password: { hash: hashPassword, verify: verifyPassword },
      },
    });
    const handler = toNodeHandler(auth);
    const app = createApp({
      logger: pino({ level: "silent" }),
      authHandler: (request, response) => {
        void handler(request, response);
      },
    });

    const signUp = await request(app).post("/api/v1/auth/sign-up/email").send({
      name: "Test User",
      email: "member@example.com",
      password: "correct-password-123",
    });
    expect(signUp.status).toBe(200);
    expect(signUp.headers["set-cookie"]).toBeDefined();
    expect(JSON.stringify(signUp.headers["set-cookie"])).toMatch(/HttpOnly/i);

    const wrongPassword = await request(app).post("/api/v1/auth/sign-in/email").send({
      email: "member@example.com",
      password: "incorrect-password-123",
    });
    const unknownUser = await request(app).post("/api/v1/auth/sign-in/email").send({
      email: "unknown@example.com",
      password: "incorrect-password-123",
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
  }, 15_000);

  it("generates avatar seeds through a non-client Better Auth field default", async () => {
    const prisma = new PrismaClient();
    try {
      const { auth } = createBetterAuth({
        prisma,
        environment: parseEnvironment({ NODE_ENV: "test" }),
      });
      const avatarField = auth.options.user?.additionalFields?.avatarSeed;
      expect(avatarField).toMatchObject({
        required: true,
        input: false,
      });
      expect(avatarField?.defaultValue).toBeTypeOf("function");
      const generated =
        typeof avatarField?.defaultValue === "function" ? avatarField.defaultValue() : null;
      expect(generated).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("mounts auth routes before the JSON parser and keeps foundation behavior", async () => {
    let sawBodyStream = false;
    const app = createApp({
      logger: pino({ level: "silent" }),
      authHandler: (request, response) => {
        sawBodyStream = request.readable;
        response.status(204).end();
      },
    });

    const authResponse = await request(app)
      .post("/api/v1/auth/sign-up/email")
      .send({ name: "Test User", email: "test@example.com", password: "not-used" });
    const healthResponse = await request(app).get("/health/live");

    expect(authResponse.status).toBe(204);
    expect(sawBodyStream).toBe(true);
    expect(healthResponse.status).toBe(200);
  });
});
