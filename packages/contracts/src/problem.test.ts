import { describe, expect, it } from "vitest";

import { problemCodeSchema, problemContentType, problemDetailsSchema } from "./problem.js";

describe("problem details contract", () => {
  it("accepts an RFC 9457 problem with an application error code", () => {
    const problem = problemDetailsSchema.parse({
      type: "https://ksat.example/problems/validation-error",
      title: "Request validation failed",
      status: 422,
      detail: "The request contains invalid fields.",
      code: "VALIDATION_FAILED",
      requestId: "req_test_123",
    });

    expect(problem.status).toBe(422);
    expect(problemContentType).toBe("application/problem+json");
  });

  it("rejects invalid status codes and unstable code shapes", () => {
    expect(
      problemDetailsSchema.safeParse({
        type: "about:blank",
        title: "Bad request",
        status: 200,
        code: "BAD_REQUEST",
        requestId: "req_test_123",
      }).success,
    ).toBe(false);

    expect(problemCodeSchema.safeParse("not a code").success).toBe(false);
  });

  it("rejects unknown problem members", () => {
    expect(
      problemDetailsSchema.safeParse({
        type: "about:blank",
        title: "Bad request",
        status: 400,
        code: "BAD_REQUEST",
        requestId: "req_test_123",
        stack: "internal detail",
      }).success,
    ).toBe(false);
  });
});
