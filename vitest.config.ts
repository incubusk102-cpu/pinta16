import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

// Vitest config for unit tests under `tests/unit/`.
//
// We deliberately keep this separate from `vite.config.ts` (the SPA
// production build) because Vitest doesn't need any of the manual chunk
// splitting, Tailwind, or React plugin baggage. Path aliases (`@/...`)
// are preserved so tests can import from `src/` the same way the SPA
// does.
//
// E2E tests under `tests/e2e/` are run by Playwright (see
// `playwright.config.ts`) and are excluded here.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/unit/**/*.{test,spec}.{js,ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    environment: "node",
    globals: false,
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "functions/api/_lib/**/*.js",
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/contexts/**/*.tsx",
      ],
      exclude: ["**/*.test.{js,ts,tsx}", "tests/**"],
    },
  },
});
