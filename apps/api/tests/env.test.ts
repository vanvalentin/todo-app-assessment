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
  });

  it("requires explicit dependency configuration in production", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL: required when NODE_ENV is production/,
    );
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
