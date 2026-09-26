import type { NextFunction, Request, RequestHandler, Response } from "express";
import { sendProblem } from "../errors.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Rejects unsafe (state-changing) requests whose Origin (or Referer origin) is not
 * an explicitly trusted origin. Better Auth performs its own origin/CSRF checks for
 * `/api/v1/auth/*`; this middleware protects the remaining application endpoints.
 */
export function createOriginCheckMiddleware(trustedOrigins: readonly string[]): RequestHandler {
  const trusted = new Set(trustedOrigins.map((origin) => origin.toLowerCase()));
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!unsafeMethods.has(request.method)) {
      next();
      return;
    }
    const origin = request.header("origin") ?? originFromReferer(request.header("referer"));
    if (!origin || !trusted.has(origin.toLowerCase())) {
      sendProblem(
        response,
        request,
        403,
        "ORIGIN_NOT_ALLOWED",
        "The request origin is not trusted.",
      );
      return;
    }
    next();
  };
}
