import { setupServer } from "msw/node";

/** Shared MSW server: every test declares the endpoints it needs. */
export const server = setupServer();
