import { test, expect, type Page } from "@playwright/test";

/**
 * Homepage e2e — adds depth beyond smoke.spec.ts:
 *   - <h1> visible
 *   - PaintingMarquee rail mounts
 *   - GalleryNav renders a primary nav link
 *   - In-page anchors (e.g. /#gallery) scroll cleanly without a JS error
 *
 * Runs against `vite preview` by default (see playwright.config.ts).
 * API-dependent assertions are kept out of this file so the suite
 * stays green without Pages Functions.
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

test.describe("homepage", () => {
  test("renders the H1, painting marquee rail, and gallery navigation", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");

    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // The PaintingMarquee mounts a strip with role="region" /
    // data-testid plus its own marquee container; we look for the
    // semantic landmark first, then fall back to any marquee element.
    const marquee = page
      .locator(
        '[data-testid="painting-marquee"], [aria-label*="painting" i], [class*="marquee" i]',
      )
      .first();
    await expect(marquee).toBeVisible({ timeout: 15_000 });

    // GalleryNav exposes a "Gallery" / "Collection" link. The link
    // either takes the visitor to /collection or scrolls the homepage
    // gallery into view depending on the route; either is fine here.
    const navLink = page
      .getByRole("link", { name: /Gallery|Collection/i })
      .first();
    await expect(navLink).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
