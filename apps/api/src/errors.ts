import { problemContentType, problemDetailsSchema, type ProblemDetails } from "@ksat/contracts";
import type { ErrorRequestHandler, Request, Response } from "express";

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: string;

  public constructor(status: number, code: string, detail: string) {
    super(detail);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function requestIdFrom(request: Request): string {
  return request.header("x-request-id") ?? "unknown";
}

export function sendProblem(
  response: Response,
  request: Request,
  status: number,
  code: string,
  detail: string,
): void {
  const problem: ProblemDetails = {
    type: `https://ksat.dev/problems/${code.toLowerCase()}`,
    title: status >= 500 ? "Internal Server Error" : code.replaceAll("_", " "),
    status,
    detail,
    instance: request.originalUrl,
    code,
    requestId: requestIdFrom(request),
  };
  response.status(status).type(problemContentType).json(problemDetailsSchema.parse(problem));
}

function isMalformedJson(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  // Express body-parser exposes these fields on its untyped parse error.
  const candidate = error as { type?: unknown; status?: unknown };
  return candidate.type === "entity.parse.failed" && candidate.status === 400;
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isMalformedJson(error)) {
    sendProblem(
      response,
      request,
      400,
      "MALFORMED_JSON",
      "The request body contains malformed JSON.",
    );
    return;
  }

  if (error instanceof HttpError) {
    sendProblem(response, request, error.status, error.code, error.detail);
    return;
  }

  // pino-http adds `log` to requests; keep this narrow cast at that middleware boundary.
  const logger = (
    request as Request & { log?: { error: (value: unknown, message: string) => void } }
  ).log;
  logger?.error({ err: error }, "Unhandled request error");
  sendProblem(response, request, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.");
};

export function notFoundHandler(request: Request, response: Response): void {
  sendProblem(response, request, 404, "NOT_FOUND", "The requested resource was not found.");
}
