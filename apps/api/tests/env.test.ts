import { describe, expect, it } from "vitest";
import { EnvironmentValidationError, parseEnvironment } from "../src/config/env.js";

describe("environment validation", () => {
  it("applies safe development defaults", () => {
    const environment = parseEnvironment({});

    expect(environment.NODE_ENV).toBe("development");
    expect(environment.PORT).toBe(3000);
    expect(environment.DATABASE_URL).toBe("postgresql://postgres:postgres@127.0.0.1:5432/ksat");
    expect(environment.S3_BUCKET).toBe("ksat");
    expect(environment.S3_FORCE_PATH_STYLE).toBe(true);
    expect(environment.BETTER_AUTH_SECRET).toContain("dev-only");
    expect(environment.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
      "http://localhost:8080",
      "http://localhost:5173",
    ]);
  });

  it("requires explicit dependency configuration in production", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL: required when NODE_ENV is production/,
    );
  });

  it("requires explicit Better Auth production configuration", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://db/ksat",
        REDIS_URL: "redis://cache",
        S3_ENDPOINT: "https://objects.example.com",
        S3_ACCESS_KEY_ID: "access",
        S3_SECRET_ACCESS_KEY: "secret",
      }),
    ).toThrow(/BETTER_AUTH_URL: required when NODE_ENV is production/);

    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://db/ksat",
        REDIS_URL: "redis://cache",
        S3_ENDPOINT: "https://objects.example.com",
        S3_ACCESS_KEY_ID: "access",
        S3_SECRET_ACCESS_KEY: "secret",
        BETTER_AUTH_URL: "https://app.example.com",
        BETTER_AUTH_SECRET: "dev-only-ksat-better-auth-secret-change-me-1234",
        BETTER_AUTH_TRUSTED_ORIGINS: "https://app.example.com",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects invalid ports and dependency URLs without exposing values", () => {
    try {
      parseEnvironment({ PORT: "70000", DATABASE_URL: "not-a-database-url" });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      if (!(error instanceof EnvironmentValidationError)) throw error;
      expect(error.message).toContain("PORT");
      expect(error.message).not.toContain("not-a-database-url");
    }
  });
});
