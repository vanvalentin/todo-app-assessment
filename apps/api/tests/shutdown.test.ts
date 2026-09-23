import { createServer } from "node:http";
import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "../src/shutdown.js";

describe("graceful shutdown", () => {
  it("closes the server and resources only once", async () => {
    const server = createServer((_request, response) => response.end("ok"));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const closeResources = vi.fn(async () => undefined);
    const shutdown = createGracefulShutdown({
      server,
      closeResources,
      logger: pino({ level: "silent" }),
      timeoutMs: 1_000,
    });

    const first = shutdown("test");
    const second = shutdown("duplicate");

    expect(first).toBe(second);
    await first;
    expect(server.listening).toBe(false);
    expect(closeResources).toHaveBeenCalledTimes(1);
  });

  it("rejects after the configured timeout when cleanup hangs", async () => {
    const closeResources = vi.fn(async () => new Promise<void>(() => undefined));
    const shutdown = createGracefulShutdown({
      closeResources,
      logger: pino({ level: "silent" }),
      timeoutMs: 20,
    });

    await expect(shutdown("test-timeout")).rejects.toThrow("shutdown timed out");
    expect(closeResources).toHaveBeenCalledTimes(1);
  });
});
