import { pino, type Logger } from "pino";
import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function getRequestId(request: IncomingMessage): string {
  const header = request.headers["x-request-id"];
  const candidate = Array.isArray(header) ? header[0] : header;
  return typeof candidate === "string" && requestIdPattern.test(candidate)
    ? candidate
    : randomUUID();
}

export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    base: { service: "ksat-api" },
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-api-key"]',
        "req.body.password",
        "req.body.token",
        "req.body.secret",
        'res.headers["set-cookie"]',
      ],
      censor: "[Redacted]",
    },
  });
}

export type { Logger };
