import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import type { Environment } from "../config/env.js";
import type { HealthChecks } from "../health.js";

export interface Infrastructure {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly s3: S3Client;
  readonly healthChecks: HealthChecks;
  close(): Promise<void>;
}

export function createInfrastructure(environment: Environment): Infrastructure {
  const prisma = new PrismaClient({
    datasources: { db: { url: environment.DATABASE_URL } },
  });
  const redis = new Redis(environment.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: environment.HEALTH_CHECK_TIMEOUT_MS,
    commandTimeout: environment.HEALTH_CHECK_TIMEOUT_MS,
  });
  const s3 = new S3Client({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY_ID ?? "anonymous",
      secretAccessKey: environment.S3_SECRET_ACCESS_KEY ?? "anonymous",
    },
  });

  const healthChecks: HealthChecks = {
    postgres: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    redis: async () => {
      await redis.ping();
    },
    s3: async (signal) => {
      await s3.send(new HeadBucketCommand({ Bucket: environment.S3_BUCKET }), {
        abortSignal: signal,
      });
    },
  };

  return {
    prisma,
    redis,
    s3,
    healthChecks,
    async close(): Promise<void> {
      await Promise.allSettled([
        prisma.$disconnect(),
        redis.status === "wait" ? Promise.resolve() : redis.quit(),
        Promise.resolve(s3.destroy()),
      ]);
    },
  };
}
