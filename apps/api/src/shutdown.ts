import type { Server } from "node:http";
import type { Logger } from "./logging.js";

export interface GracefulShutdownOptions {
  server?: Server;
  closeResources?: () => Promise<void>;
  logger: Logger;
  timeoutMs: number;
}

export function createGracefulShutdown(
  options: GracefulShutdownOptions,
): (reason: string) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  const closeServer = async (): Promise<void> => {
    if (!options.server || !options.server.listening) return;
    await new Promise<void>((resolve, reject) => {
      options.server?.close((error) => {
        // Node's close callback uses a generic Error; this narrows its documented errno code.
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  return (reason: string): Promise<void> => {
    shutdownPromise ??= (async () => {
      options.logger.info({ reason }, "Graceful shutdown started");
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([closeServer(), options.closeResources?.() ?? Promise.resolve()]).then(
            () => undefined,
          ),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("shutdown timed out")), options.timeoutMs);
          }),
        ]);
        options.logger.info("Graceful shutdown complete");
      } catch (error) {
        options.server?.closeAllConnections();
        options.logger.error({ err: error }, "Graceful shutdown failed");
        throw error;
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    })();

    return shutdownPromise;
  };
}
