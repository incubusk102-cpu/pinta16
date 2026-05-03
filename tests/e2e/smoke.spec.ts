import { test, expect, type Page } from "@playwright/test";

/**
 * Golden-path smoke suite for canvhub.com.
 *
 * These tests are intentionally light — they assert the public-facing
 * routes render without a hard error. They do **not** exercise any
 * flow that requires a live API: the default `webServer` runs `vite
 * preview`, which is a static file server, so `functions/api/*`
 * isn't available. Tests that need the real API (cart → checkout →
 * PayMongo) should be added later, run with
 * `BASE_URL=https://canvhub.com npm run test:e2e`.
 *
 * Each test: opens a route, asserts no console errors, asserts a
 * key piece of content is present.
 */

// Suppress the first-visit "Welcome to Canvas Hub" modal so it
// doesn't cover the heading the tests assert against. The key
// matches the constant in `src/components/NewUserModal.tsx`.
const NEWUSER_MODAL_SEEN_KEY = "canvhub:newuser-modal:seen-v1";

const collectConsoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Filter out noisy network errors caused by `vite preview` not
    // serving Pages Functions — the SPA falls back to defaults,
    // which is the expected behaviour. We only care about *render*
    // errors (uncaught exceptions surface via `pageerror`, not
    // `console.error`).
    if (
      text.includes("/api/") ||
      text.includes("Failed to load resource") ||
      text.includes("net::ERR_") ||
      text.includes("Service Worker") ||
      text.includes("accounts.google.com") ||
      text.includes("gsi/client")
    ) {
      return;
    }
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return errors;
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Some browser configs throw on localStorage access; not fatal
      // for the smoke tests.
    }
  }, NEWUSER_MODAL_SEEN_KEY);
});

test.describe("public smoke", () => {
  test("home page renders the hero heading", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    // The route's head() metadata isn't applied client-side in SPA
    // mode (TanStack Router only runs head() under Start/SSR), so
    // we assert against in-page content rather than document.title.
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test("login page renders the sign-in heading", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/login");
    // LoginPage renders `<h1>Sign in</h1>`. The Google Sign-In
    // button can't be asserted against in a static-preview run
    // because the GIS script is blocked by CSP / not initialised
    // outside a real browser session, but the surrounding shell
    // always renders.
    const heading = page.getByRole("heading", { level: 1, name: /Sign in/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test("signup route redirects to login", async ({ page }) => {
    await page.goto("/signup");
    // SignupRedirect uses navigate({ to: "/login", replace: true }).
    await expect(page).toHaveURL(/\/login\/?$/, { timeout: 15_000 });
    const heading = page.getByRole("heading", { level: 1, name: /Sign in/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  // The four policy slugs always render the same SPA shell. Body
  // content depends on either (a) bundled defaults from #227, or
  // (b) live admin-edited values from the POLICIES KV namespace.
  // Neither is available against `vite preview`, so the
  // assertion here is intentionally minimal: the route should
  // resolve (200, not 404) and the page shouldn't crash.
  for (const slug of ["terms", "refund", "shipping", "privacy"] as const) {
    test(`/policy/${slug} renders the SPA shell without JS errors`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      const response = await page.goto(`/policy/${slug}`);
      expect(response?.status()).toBeLessThan(400);
      // The policy view always renders an <article> wrapper, even
      // when the body is empty.
      const article = page.locator("article").first();
      await expect(article).toBeVisible({ timeout: 15_000 });
      expect(errors).toEqual([]);
    });
  }
});
