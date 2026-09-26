import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { createBetterAuth } from "./auth/config.js";
import { createBetterAuthSessionResolver } from "./auth/session.js";
import { loadEnvironment } from "./config/env.js";
import { createInfrastructure } from "./infrastructure/dependencies.js";
import { createMailer } from "./infrastructure/mail.js";
import { createLogger } from "./logging.js";
import { buildOpenApiDocument } from "./openapi.js";
import { configureApiRoutes } from "./routes.js";
import { createBoardListCache } from "./modules/boards/boards.cache.js";
import { createPrismaBoardsRepository } from "./modules/boards/boards.repository.js";
import { createBoardsService } from "./modules/boards/boards.service.js";
import { createPrismaInvitationsRepository } from "./modules/invitations/invitations.repository.js";
import { createInvitationsService } from "./modules/invitations/invitations.service.js";
import { createPrismaTasksRepository } from "./modules/tasks/tasks.repository.js";
import { createTasksService } from "./modules/tasks/tasks.service.js";
import { createRateLimiter } from "./lib/rateLimiter.js";
import { createGracefulShutdown } from "./shutdown.js";

export async function startServer(): Promise<Server> {
  const environment = loadEnvironment();
  const logger = createLogger(environment.LOG_LEVEL, environment.NODE_ENV !== "production");
  const infrastructure = createInfrastructure(environment);
  let auth: ReturnType<typeof createBetterAuth>;
  try {
    auth = createBetterAuth({
      prisma: infrastructure.prisma,
      redis: infrastructure.redis,
      environment,
    });
  } catch (error) {
    await infrastructure.close();
    throw error;
  }
  const boardCache = createBoardListCache(infrastructure.redis, logger);
  const boards = createBoardsService({
    repository: createPrismaBoardsRepository(infrastructure.prisma),
    cache: boardCache,
  });
  const invitations = createInvitationsService({
    repository: createPrismaInvitationsRepository(infrastructure.prisma),
    mailer: createMailer(environment),
    logger,
    appPublicUrl: environment.APP_PUBLIC_URL,
    ttlHours: environment.INVITATION_TTL_HOURS,
    boardCache,
  });
  const tasks = createTasksService({
    repository: createPrismaTasksRepository(infrastructure.prisma),
  });
  const app = createApp({
    logger,
    healthChecks: infrastructure.healthChecks,
    healthCheckTimeoutMs: environment.HEALTH_CHECK_TIMEOUT_MS,
    trustProxy: environment.TRUST_PROXY,
    authHandler: auth.handler,
    openApiDocument: buildOpenApiDocument(),
    configureRoutes: (expressApp) =>
      configureApiRoutes(expressApp, {
        boards,
        invitations,
        tasks,
        resolveSession: createBetterAuthSessionResolver(auth.auth),
        rateLimiter: createRateLimiter(infrastructure.redis),
        trustedOrigins: environment.BETTER_AUTH_TRUSTED_ORIGINS,
      }),
  });
  try {
    const server = await new Promise<Server>((resolveServer, reject) => {
      const candidate = app.listen(environment.PORT, environment.HOST, () => {
        candidate.removeListener("error", onError);
        resolveServer(candidate);
      });
      function onError(error: Error): void {
        candidate.removeListener("error", onError);
        reject(error);
      }
      candidate.once("error", onError);
    });
    const shutdown = createGracefulShutdown({
      server,
      closeResources: infrastructure.close,
      logger,
      timeoutMs: environment.SHUTDOWN_TIMEOUT_MS,
    });
    process.once("SIGTERM", () => void shutdown("SIGTERM").catch(() => process.exit(1)));
    process.once("SIGINT", () => void shutdown("SIGINT").catch(() => process.exit(1)));
    logger.info({ host: environment.HOST, port: environment.PORT }, "API server listening");
    return server;
  } catch (error) {
    await infrastructure.close();
    logger.fatal({ err: error }, "API server failed to start");
    throw error;
  }
}
const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  startServer().catch(() => {
    process.exitCode = 1;
  });
