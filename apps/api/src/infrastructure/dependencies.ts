import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { Redis } from "ioredis";
import type { Environment } from "../config/env.js";
import type { HealthChecks } from "../health.js";

export interface Infrastructure {
  readonly postgres: Pool;
  readonly redis: Redis;
  readonly s3: S3Client;
  readonly healthChecks: HealthChecks;
  close(): Promise<void>;
}

export function createInfrastructure(environment: Environment): Infrastructure {
  const postgres = new Pool({
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: environment.HEALTH_CHECK_TIMEOUT_MS,
    query_timeout: environment.HEALTH_CHECK_TIMEOUT_MS,
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
      await postgres.query("SELECT 1");
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
    postgres,
    redis,
    s3,
    healthChecks,
    async close(): Promise<void> {
      await Promise.allSettled([
        postgres.end(),
        redis.status === "wait" ? Promise.resolve() : redis.quit(),
        s3.destroy(),
      ]);
    },
  };
}
