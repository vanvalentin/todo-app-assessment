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

const developmentAuthSecret = "dev-only-ksat-better-auth-secret-change-me-1234";
const localTrustedOrigins = ["http://localhost:8080", "http://localhost:5173"];
const originsFromEnv = z
  .preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0)
        : value,
    z.array(urlWithProtocol(["http", "https"])).min(1),
  )
  .default(localTrustedOrigins);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  TRUST_PROXY: booleanFromEnv.default(false),
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
  BETTER_AUTH_URL: urlWithProtocol(["http", "https"]).default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).default(developmentAuthSecret),
  BETTER_AUTH_TRUSTED_ORIGINS: originsFromEnv,
  // Validated now so a later provider slice cannot accept unvalidated secrets.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
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
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_TRUSTED_ORIGINS",
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
    if (input.BETTER_AUTH_SECRET === developmentAuthSecret) {
      throw new EnvironmentValidationError(["BETTER_AUTH_SECRET: must be a deployment secret"]);
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
