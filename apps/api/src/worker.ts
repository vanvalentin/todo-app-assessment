import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createInfrastructure } from "./infrastructure/dependencies.js";
import { loadEnvironment } from "./config/env.js";
import { createLogger } from "./logging.js";

export async function startWorker(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment.LOG_LEVEL, environment.NODE_ENV !== "production");
  const infrastructure = createInfrastructure(environment);
  logger.info("Worker is idle; no background jobs are configured in phase 2 identity");

  await new Promise<void>((resolveWorker) => {
    let stopped = false;
    const keepAlive = setInterval(() => undefined, 60_000);
    const stop = (reason: string) => {
      if (stopped) return;
      stopped = true;
      clearInterval(keepAlive);
      void infrastructure.close().finally(() => {
        logger.info({ reason }, "Idle worker stopped");
        resolveWorker();
      });
    };
    process.once("SIGTERM", () => stop("SIGTERM"));
    process.once("SIGINT", () => stop("SIGINT"));
  });
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startWorker().catch(() => {
    process.exitCode = 1;
  });
}
