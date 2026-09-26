import { problemDetailsSchema, type ProblemFieldError } from "@ksat/contracts";
import type { ZodType } from "zod";

/**
 * Application requests go to the same origin: Vite proxies `/api` in development and
 * Nginx does in the container image, so cookies stay first-party and no CORS is needed.
 * `VITE_API_BASE_URL` exists for tests and for a split-origin deployment.
 */
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;

/** A validated RFC 9457 Problem Details response from the application API. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly title: string;
  public readonly detail: string | undefined;
  public readonly fieldErrors: readonly ProblemFieldError[];
  public readonly requestId: string | undefined;

  public constructor(problem: {
    status: number;
    code: string;
    title: string;
    detail?: string | undefined;
    requestId?: string | undefined;
    fieldErrors?: readonly ProblemFieldError[] | undefined;
  }) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.code = problem.code;
    this.title = problem.title;
    this.detail = problem.detail;
    this.fieldErrors = problem.fieldErrors ?? [];
    this.requestId = problem.requestId;
  }

  /** Field-level message for a form field, when the API reported one. */
  public fieldError(path: string): string | undefined {
    return this.fieldErrors.find((issue) => issue.path === path)?.message;
  }
}

/** The request never reached the API (offline, DNS failure, cancelled socket). */
export class NetworkError extends Error {
  public constructor() {
    super("The request could not reach the API.");
    this.name = "NetworkError";
  }
}

/** The API answered with a body that does not satisfy the shared contract. */
export class UnexpectedResponseError extends Error {
  public constructor(status: number) {
    super(`The API returned an unexpected response (status ${status}).`);
    this.name = "UnexpectedResponseError";
  }
}

export interface ApiRequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function problemFrom(response: Response, payload: unknown): ApiError {
  const parsed = problemDetailsSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError({
      status: parsed.data.status,
      code: parsed.data.code,
      title: parsed.data.title,
      detail: parsed.data.detail,
      requestId: parsed.data.requestId,
      fieldErrors: parsed.data.errors,
    });
  }

  return new ApiError({
    status: response.status,
    code: "UNEXPECTED_ERROR",
    title: "The request failed.",
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Performs a JSON request against the application API, validates the response with the
 * shared contract, and translates failures into typed errors.
 */
export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, apiBaseUrl), {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new NetworkError();
  }

  if (!response.ok) {
    throw problemFrom(response, await readJson(response));
  }

  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new UnexpectedResponseError(response.status);
  }
  return parsed.data;
}

/** Performs a request whose successful response intentionally has no body. */
export async function apiRequestNoContent(
  path: string,
  options: Omit<ApiRequestOptions, "body"> = {},
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(new URL(path, apiBaseUrl), {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: new Headers({ Accept: "application/json" }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new NetworkError();
  }
  if (!response.ok) throw problemFrom(response, await readJson(response));
}

/**
 * TanStack Query retry policy: only transient failures are retried once, so a 4xx
 * (unauthenticated, forbidden, not found, conflict, rate limited) surfaces immediately.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 1;
}

/** True when a rejected query or mutation was cancelled rather than failed. */
export function isCancelled(error: unknown): boolean {
  return isAbortError(error) || (error instanceof Error && error.name === "CancelledError");
}
