import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { HealthChecks } from "../src/health.js";
import { createLogger } from "../src/logging.js";

const healthyChecks: HealthChecks = {
  postgres: async () => undefined,
  redis: async () => undefined,
  s3: async () => undefined,
};

function appWith(checks: HealthChecks = healthyChecks) {
  return createApp({
    logger: pino({ level: "silent" }),
    healthChecks: checks,
    healthCheckTimeoutMs: 25,
  });
}

describe("API foundation", () => {
  it("constructs the production logger with sensitive-field redaction", () => {
    expect(() => createLogger("silent")).not.toThrow();
  });

  it("returns a live response without checking dependencies", async () => {
    const response = await request(appWith()).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", service: "api" });
  });

  it("returns 503 and safe dependency states when readiness fails", async () => {
    const checks: HealthChecks = {
      postgres: async () => {
        throw new Error("database password must not escape");
      },
      redis: async () => undefined,
      s3: async () => undefined,
    };

    const response = await request(appWith(checks)).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("down");
    expect(response.body.checks.postgres.status).toBe("down");
    expect(response.body.checks.redis.status).toBe("ok");
    expect(response.body.checks.s3.status).toBe("ok");
    expect(JSON.stringify(response.body)).not.toContain("database password");
  });

  it("bounds and aborts a dependency check", async () => {
    let postgresSignal: AbortSignal | undefined;
    const checks: HealthChecks = {
      postgres: async (signal) => {
        postgresSignal = signal;
        await new Promise<void>(() => undefined);
      },
      redis: async () => undefined,
      s3: async () => undefined,
    };

    const response = await request(appWith(checks)).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.checks.postgres.status).toBe("degraded");
    expect(postgresSignal?.aborted).toBe(true);
  });

  it("maps malformed JSON to RFC 9457 problem details", async () => {
    const response = await request(appWith())
      .post("/not-a-route")
      .set("content-type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.type).toBe("application/problem+json");
    expect(response.body).toMatchObject({ code: "MALFORMED_JSON", status: 400 });
  });

  it("returns a problem detail for unknown routes", async () => {
    const response = await request(appWith()).get("/missing");

    expect(response.status).toBe(404);
    expect(response.type).toBe("application/problem+json");
    expect(response.body).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("preserves a valid request ID and includes it in responses", async () => {
    const response = await request(appWith())
      .get("/health/live")
      .set("x-request-id", "test-request-42");

    expect(response.headers["x-request-id"]).toBe("test-request-42");
    expect(response.body).not.toHaveProperty("requestId");
  });

  it("does not expose unexpected errors", async () => {
    const app = createApp({
      logger: pino({ level: "silent" }),
      healthChecks: healthyChecks,
      configureRoutes: (expressApp) => {
        expressApp.get("/test-error", () => {
          throw new Error("secret implementation detail");
        });
      },
    });

    const response = await request(app).get("/test-error");

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: "INTERNAL_SERVER_ERROR", status: 500 });
    expect(JSON.stringify(response.body)).not.toContain("secret implementation detail");
  });
});
