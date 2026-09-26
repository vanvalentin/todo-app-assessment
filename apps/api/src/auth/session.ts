import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { createBetterAuth } from "./config.js";
import { sendProblem } from "../errors.js";

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly avatarSeed: string;
}

export interface ResolvedSession {
  readonly user: SessionUser;
}

export type ResolveSession = (request: Request) => Promise<ResolvedSession | null>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: ResolvedSession;
    }
  }
}

type BetterAuthInstance = ReturnType<typeof createBetterAuth>["auth"];

/**
 * Resolves the caller's session through Better Auth's own `getSession` API.
 * Better Auth's additional-field typing for `avatarSeed` does not flow through
 * `auth.api.getSession`'s inferred return type, so this narrow boundary reads it
 * off the returned user record, which always carries it at runtime.
 */
export function createBetterAuthSessionResolver(auth: BetterAuthInstance): ResolveSession {
  return async (request: Request): Promise<ResolvedSession | null> => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) return null;
    // SAFETY: Better Auth's additional-field typing for `avatarSeed` does not flow
    // through `auth.api.getSession`'s inferred return type; the field is always
    // present at runtime because it is a required, server-defaulted user column.
    const user = result.user as unknown as {
      id: string;
      name: string;
      email: string;
      avatarSeed: string;
    };
    return {
      user: { id: user.id, name: user.name, email: user.email, avatarSeed: user.avatarSeed },
    };
  };
}

/** Attaches `request.session` or responds `401 UNAUTHENTICATED`. */
export function requireSession(resolveSession: ResolveSession): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    resolveSession(request)
      .then((session) => {
        if (!session) {
          sendProblem(response, request, 401, "UNAUTHENTICATED", "Sign in is required.");
          return;
        }
        request.session = session;
        next();
      })
      .catch(next);
  };
}

/** Resolves the session if present but never rejects the request when absent. */
export function attachOptionalSession(resolveSession: ResolveSession): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    resolveSession(request)
      .then((session) => {
        if (session) request.session = session;
        next();
      })
      .catch(next);
  };
}
