import { boardListResponseSchema } from "@ksat/contracts";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../test/server";
import { ApiError, NetworkError, UnexpectedResponseError, apiRequest, shouldRetry } from "./client";

const PATH = "/api/v1/boards";

describe("apiRequest", () => {
  it("parses a successful response with the shared contract", async () => {
    server.use(http.get(PATH, () => HttpResponse.json({ items: [], nextCursor: null })));

    await expect(apiRequest(PATH, boardListResponseSchema)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("sends the request as a same-origin cookie request", async () => {
    let credentials: RequestCredentials | undefined;
    server.use(
      http.get(PATH, ({ request }) => {
        credentials = request.credentials;
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    await apiRequest(PATH, boardListResponseSchema);

    expect(credentials).toBe("same-origin");
  });

  it("sends PATCH JSON bodies and parses the shared board response", async () => {
    let method = "";
    let body: unknown;
    server.use(
      http.patch(PATH, async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    await apiRequest(PATH, boardListResponseSchema, {
      method: "PATCH",
      body: { name: "Renamed", description: null, version: 4 },
    });
    expect(method).toBe("PATCH");
    expect(body).toEqual({ name: "Renamed", description: null, version: 4 });
  });

  it("translates an RFC 9457 problem response into a typed error", async () => {
    server.use(
      http.post(PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "That person is already a member of this board.",
            code: "ALREADY_MEMBER",
            requestId: "req-42",
            errors: [{ path: "email", message: "Already a member." }],
          },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );

    const error: unknown = await apiRequest(PATH, boardListResponseSchema, {
      method: "POST",
      body: { email: "ada@example.test", role: "CONTRIBUTOR" },
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe("ALREADY_MEMBER");
    expect(apiError.requestId).toBe("req-42");
    expect(apiError.fieldError("email")).toBe("Already a member.");
    expect(apiError.message).toBe("That person is already a member of this board.");
  });

  it("falls back to a safe error when a failure is not problem details", async () => {
    server.use(http.get(PATH, () => new HttpResponse("<html>gateway</html>", { status: 502 })));

    const error: unknown = await apiRequest(PATH, boardListResponseSchema).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UNEXPECTED_ERROR");
    expect((error as ApiError).status).toBe(502);
  });

  it("rejects a success body that violates the contract", async () => {
    server.use(
      http.get(PATH, () => HttpResponse.json({ items: [{ id: "not-a-uuid" }], nextCursor: null })),
    );

    await expect(apiRequest(PATH, boardListResponseSchema)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it("reports an unreachable API as a network error", async () => {
    server.use(http.get(PATH, () => HttpResponse.error()));

    await expect(apiRequest(PATH, boardListResponseSchema)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("shouldRetry", () => {
  it("does not retry client errors and retries transient failures once", () => {
    const conflict = new ApiError({ status: 409, code: "ALREADY_MEMBER", title: "Conflict" });
    const serverError = new ApiError({ status: 503, code: "SERVICE_UNAVAILABLE", title: "Down" });

    expect(shouldRetry(0, conflict)).toBe(false);
    expect(shouldRetry(0, new NetworkError())).toBe(true);
    expect(shouldRetry(1, new NetworkError())).toBe(false);
    expect(shouldRetry(0, serverError)).toBe(true);
  });
});
