import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the canvhub.com smoke suite.
 *
 * Two ways to run:
 *
 *   1) Against a local build (default for CI and `npm run test:e2e`):
 *      Playwright builds the SPA with `npm run build` and serves the
 *      `dist/` output via `vite preview` on port 4173. **Note**: this
 *      means Pages Functions (`functions/api/*`) are NOT available —
 *      `vite preview` is a static file server. Tests should therefore
 *      only assert UI that is reachable without a live API. The
 *      bundled policy fallbacks (#227) and the React-only routes
 *      (login, signup) are the right targets here.
 *
 *   2) Against a deployed environment (canvhub.com or a preview
 *      deploy URL):
 *
 *        BASE_URL=https://canvhub.com npm run test:e2e
 *
 *      This skips the local web-server and runs the same specs
 *      against the live site, where the API IS available.
 *
 * Browser scope:
 *   - Chromium only by default. WebKit + Firefox can be enabled with
 *     `ALL_BROWSERS=1 npm run test:e2e`. Skipping mobile WebKit /
 *     mobile Chrome by default keeps install footprint small —
 *     they download ~ 200 MB each.
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const useLocalServer = !process.env.BASE_URL;
const allBrowsers = process.env.ALL_BROWSERS === "1";

export default defineConfig({
  testDir: "./tests/e2e",

  // Each spec is independent; run them in parallel locally and serial
  // on CI for deterministic reports.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Smoke tests should be quick — fail fast if a page hangs.
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: allBrowsers
    ? [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
        {
          name: "mobile-chromium",
          use: { ...devices["Pixel 7"] },
        },
        {
          name: "mobile-webkit",
          use: { ...devices["iPhone 14"] },
        },
      ]
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Boot a local Vite preview server for the default run. Skipped
  // when BASE_URL is set explicitly (we trust whatever's there).
  webServer: useLocalServer
    ? {
        command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
