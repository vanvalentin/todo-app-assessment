import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import { errorHandler, notFoundHandler } from "./errors.js";
import {
  liveHealthResponse,
  readyHealthResponse,
  runReadinessChecks,
  unavailableHealthChecks,
  type HealthChecks,
} from "./health.js";
import { createLogger, getRequestId } from "./logging.js";

export interface AppOptions {
  logger?: Logger;
  healthChecks?: HealthChecks;
  healthCheckTimeoutMs?: number;
  configureRoutes?: (app: Express) => void;
}

export function createApp(options: AppOptions = {}): Express {
  const logger = options.logger ?? createLogger("silent");
  const healthChecks = options.healthChecks ?? unavailableHealthChecks();
  const healthCheckTimeoutMs = options.healthCheckTimeoutMs ?? 2_000;
  const app = express();

  app.disable("x-powered-by");
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => {
        const id = getRequestId(request);
        request.headers["x-request-id"] = id;
        return id;
      },
      customLogLevel: (_request, response, error) => {
        if (error || response.statusCode >= 500) return "error";
        if (response.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );
  app.use((request, response, next) => {
    const id = request.header("x-request-id") ?? getRequestId(request);
    response.setHeader("x-request-id", id);
    next();
  });
  app.use(express.json({ limit: "1mb", strict: true }));

  app.get("/health/live", (_request, response) => {
    response.status(200).json(liveHealthResponse());
  });

  app.get("/health/ready", async (_request, response) => {
    const result = await runReadinessChecks(healthChecks, healthCheckTimeoutMs);
    response.status(result.ready ? 200 : 503).json(readyHealthResponse(result));
  });

  options.configureRoutes?.(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
