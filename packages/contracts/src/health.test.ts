import { describe, expect, it } from "vitest";

import { healthResponseSchema, livenessResponseSchema, readinessResponseSchema } from "./health.js";

describe("health contracts", () => {
  const timestamp = "2025-01-01T00:00:00.000Z";

  it("accepts a liveness response with the required timestamp", () => {
    const response = livenessResponseSchema.parse({
      status: "ok",
      timestamp,
    });

    expect(response.status).toBe("ok");
    expect(response.timestamp).toBe(timestamp);
  });

  it("accepts readiness dependency checks", () => {
    const response = readinessResponseSchema.parse({
      status: "ok",
      service: "api",
      timestamp,
      checks: {
        postgres: { status: "ok", latencyMs: 4 },
        redis: { status: "degraded", message: "Cache is unavailable" },
      },
    });

    expect(response.checks?.postgres?.latencyMs).toBe(4);
  });

  it("accepts API dependency checks and request IDs", () => {
    const response = readinessResponseSchema.parse({
      status: "error",
      service: "api",
      timestamp,
      requestId: "req_test_123",
      dependencies: {
        postgres: { status: "up" },
        redis: { status: "timeout" },
      },
    });

    expect(response.dependencies?.redis?.status).toBe("timeout");
  });

  it("rejects malformed timestamps and unknown fields", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        timestamp: "not-a-timestamp",
      }).success,
    ).toBe(false);

    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        timestamp,
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
