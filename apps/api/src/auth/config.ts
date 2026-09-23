import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Environment } from "../config/env.js";
import { generateAvatarSeed, generateUuid } from "./identity.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createResilientSecondaryStorage, type RedisStorageClient } from "./storage.js";

export interface BetterAuthDependencies {
  readonly prisma: PrismaClient;
  readonly redis?: Redis;
  readonly environment: Environment;
}

export function createBetterAuth({ prisma, redis, environment }: BetterAuthDependencies) {
  const redisStorageClient: RedisStorageClient | undefined = redis
    ? {
        get: (key) => redis.get(key),
        set: (key, value, ttl) =>
          ttl === undefined ? redis.set(key, value) : redis.set(key, value, "EX", ttl),
        del: (key) => redis.del(key),
      }
    : undefined;
  const secondaryStorage = redisStorageClient
    ? createResilientSecondaryStorage(redisStorageClient)
    : undefined;
  const auth = betterAuth({
    appName: "Ksat",
    baseURL: environment.BETTER_AUTH_URL,
    basePath: "/api/v1/auth",
    secret: environment.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    ...(secondaryStorage ? { secondaryStorage } : {}),
    trustedOrigins: environment.BETTER_AUTH_TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    user: {
      additionalFields: {
        avatarSeed: {
          type: "string",
          required: true,
          input: false,
          returned: true,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            void user;
            return { data: { avatarSeed: generateAvatarSeed() } };
          },
        },
      },
    },
    session: {
      storeSessionInDatabase: true,
      expiresIn: 60 * 60 * 24 * 7,
    },
    rateLimit: {
      enabled: true,
      storage: secondaryStorage ? "secondary-storage" : "memory",
      window: 10,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 3_600, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: environment.NODE_ENV === "production",
      disableCSRFCheck: false,
      database: {
        generateId: () => generateUuid(),
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: environment.NODE_ENV === "production",
        path: "/",
      },
    },
  });

  const nodeHandler = toNodeHandler(auth);
  const handler: RequestHandler = (request, response) => {
    void nodeHandler(request, response);
  };

  return { auth, handler };
}
