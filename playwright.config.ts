import { defineConfig, devices } from "@playwright/test";

/**
 * Browser suite for the critical user journeys. It runs against an already-running
 * app (Vite dev server or the Nginx image); `E2E_BASE_URL` selects the origin.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const isCi = process.env.CI !== undefined && process.env.CI !== "";

export default defineConfig({
  testDir: "./e2e",
  // Journeys share one database, so they run one at a time and never in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
