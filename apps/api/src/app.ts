import express, { type Express, type RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
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
import type { OpenApiDocument } from "./openapi.js";
export interface AppOptions {
  logger?: Logger;
  healthChecks?: HealthChecks;
  healthCheckTimeoutMs?: number;
  trustProxy?: boolean;
  authHandler?: RequestHandler;
  configureRoutes?: (app: Express) => void;
  openApiDocument?: OpenApiDocument;
}
export function createApp(options: AppOptions = {}): Express {
  const logger = options.logger ?? createLogger("silent");
  const healthChecks = options.healthChecks ?? unavailableHealthChecks();
  const healthCheckTimeoutMs = options.healthCheckTimeoutMs ?? 2_000;
  const app = express();
  app.disable("x-powered-by");
  if (options.trustProxy !== undefined) {
    // The production topology has one trusted Nginx hop. Nginx overwrites XFF,
    // so Express must trust exactly that hop rather than an attacker-controlled chain.
    app.set("trust proxy", options.trustProxy ? 1 : false);
  }
  app.use(pinoHttp({ logger, genReqId: getRequestId }));
  app.use((request, response, next) => {
    const rawId = request.id;
    const id =
      typeof rawId === "string" || typeof rawId === "number" ? rawId : getRequestId(request);
    response.setHeader("x-request-id", id);
    next();
  });
  if (options.authHandler) app.all("/api/v1/auth{/*splat}", options.authHandler);
  app.use(express.json({ limit: "1mb", strict: true }));
  app.get("/health/live", (_request, response) => {
    response.status(200).json(liveHealthResponse());
  });
  app.get("/health/ready", async (_request, response) => {
    const result = await runReadinessChecks(healthChecks, healthCheckTimeoutMs);
    response.status(result.ready ? 200 : 503).json(readyHealthResponse(result));
  });
  if (options.openApiDocument) {
    app.get("/api/docs/openapi.json", (_request, response) => {
      response.status(200).json(options.openApiDocument);
    });
    app.use(
      "/api/docs",
      swaggerUi.serve,
      swaggerUi.setup(options.openApiDocument, { explorer: true }),
    );
  }
  options.configureRoutes?.(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
