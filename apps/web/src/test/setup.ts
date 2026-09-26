import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { transferableAbortController } from "node:util";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

/**
 * Node's fetch rejects an AbortSignal that was not created by its own implementation,
 * and jsdom installs a different AbortController/AbortSignal on the global object. Align
 * the realms so cancellation signals from TanStack Query reach fetch instead of being
 * refused as an invalid RequestInit.
 */
const nodeRealmController = transferableAbortController();
const NodeAbortController = nodeRealmController.constructor as typeof AbortController;
const NodeAbortSignal = Object.getPrototypeOf(nodeRealmController.signal)
  .constructor as typeof AbortSignal;

if (globalThis.AbortController !== NodeAbortController) {
  globalThis.AbortController = NodeAbortController;
  globalThis.AbortSignal = NodeAbortSignal;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  // Unmount first so a late refetch cannot outlive its test's handlers.
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
