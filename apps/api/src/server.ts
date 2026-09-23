import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { createBetterAuth } from "./auth/config.js";
import { loadEnvironment } from "./config/env.js";
import { createInfrastructure } from "./infrastructure/dependencies.js";
import { createLogger } from "./logging.js";
import { createGracefulShutdown } from "./shutdown.js";

export async function startServer(): Promise<Server> {
  const environment = loadEnvironment();
  const logger = createLogger(environment.LOG_LEVEL);
  const infrastructure = createInfrastructure(environment);
  let authHandler: ReturnType<typeof createBetterAuth>["handler"];
  try {
    authHandler = createBetterAuth({
      prisma: infrastructure.prisma,
      redis: infrastructure.redis,
      environment,
    }).handler;
  } catch (error) {
    await infrastructure.close();
    throw error;
  }
  const app = createApp({
    logger,
    healthChecks: infrastructure.healthChecks,
    healthCheckTimeoutMs: environment.HEALTH_CHECK_TIMEOUT_MS,
    trustProxy: environment.TRUST_PROXY,
    authHandler,
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
if (isMain) {
  startServer().catch(() => {
    process.exitCode = 1;
  });
}
