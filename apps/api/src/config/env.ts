import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean());

const urlWithProtocol = (protocols: readonly string[]) =>
  z
    .string()
    .url()
    .refine(
      (value) => protocols.some((protocol) => value.startsWith(`${protocol}://`)),
      `must use one of: ${protocols.join(", ")}`,
    );

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(50).max(30_000).default(2_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  DATABASE_URL: urlWithProtocol(["postgres", "postgresql"]).default(
    "postgresql://postgres:postgres@127.0.0.1:5432/ksat",
  ),
  REDIS_URL: urlWithProtocol(["redis", "rediss"]).default("redis://127.0.0.1:6379"),
  S3_ENDPOINT: z.string().url().default("http://127.0.0.1:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("ksat"),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: booleanFromEnv.default(true),
});

export type Environment = z.infer<typeof environmentSchema>;

export class EnvironmentValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`Invalid environment configuration: ${issues.join("; ")}`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

const productionRequiredKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

/** Parse a supplied record so startup and tests do not depend on process-global mutation. */
export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  if (input.NODE_ENV === "production") {
    const missing = productionRequiredKeys.filter((key) => !input[key]);
    if (missing.length > 0) {
      throw new EnvironmentValidationError(
        missing.map((key) => `${key}: required when NODE_ENV is production`),
      );
    }
  }

  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    );
    throw new EnvironmentValidationError(issues);
  }
  return result.data;
}

export function loadEnvironment(): Environment {
  return parseEnvironment(process.env);
}
