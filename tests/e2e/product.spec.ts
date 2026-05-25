import { test, expect, type Page } from "@playwright/test";

/**
 * Product page e2e — runs against a static `vite preview` build so
 * no `/api/products` data is available. The product route under
 * `vite preview` therefore renders the empty-state / not-found UI
 * (the catalogue is fetched at runtime via Pages Functions in
 * production). We assert on the parts of the page that DO render
 * even without an API: the SPA shell, a heading, the document
 * title set by either `useSEO` or the index.html fallback, and the
 * absence of uncaught render errors. Live API behaviour is covered
 * by running the same suite against canvhub.com with
 * `BASE_URL=https://canvhub.com npm run test:e2e`.
 */

const NEWUSER_MODAL_SEEN_KEY = "canvhub:newuser-modal:seen-v1";

const collectConsoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (
      text.includes("/api/") ||
      text.includes("Failed to load resource") ||
      text.includes("net::ERR_") ||
      text.includes("Service Worker") ||
      text.includes("accounts.google.com") ||
      text.includes("gsi/client") ||
      text.includes("fonts.googleapis.com") ||
      text.includes("fonts.gstatic.com")
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
      /* not fatal */
    }
  }, NEWUSER_MODAL_SEEN_KEY);
});

test.describe("product page", () => {
  test("renders the SPA shell without uncaught render errors", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    const response = await page.goto("/product/test-product-id");
    // The SPA always returns 200 (index.html fallback) — TanStack
    // Router takes over client-side.
    expect(response?.status()).toBeLessThan(400);

    // The product route mounts its own header / nav even before the
    // catalog resolves, so a heading should be visible.
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Document title should mention Canvas Hub — either the
    // static `index.html` fallback OR the per-route `useSEO`
    // override post-mount.
    await expect(page).toHaveTitle(/Canvas Hub/, { timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
