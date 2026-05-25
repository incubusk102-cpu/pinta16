import { test, expect, type Page } from "@playwright/test";

/**
 * Navigation e2e — `/collection`, `/about`, `/contact`, `/resources`
 * all need to load without uncaught render errors. These are the
 * routes that IMPROVEMENTS.md item 1 added to the middleware
 * HTML-path allow-list, so a smoke check that they at least render
 * client-side is a useful regression guard.
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

const PUBLIC_PAGES: Array<{ path: string; titlePattern: RegExp }> = [
  { path: "/collection", titlePattern: /Collection|Canvas Hub/ },
  { path: "/about", titlePattern: /About|Canvas Hub/ },
  { path: "/contact", titlePattern: /Contact|Canvas Hub/ },
  { path: "/resources", titlePattern: /Resources|Canvas Hub/ },
];

for (const { path, titlePattern } of PUBLIC_PAGES) {
  test(`navigation: ${path} renders without uncaught errors`, async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);

    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveTitle(titlePattern, { timeout: 15_000 });

    // Canonical link tag should match the current path (set by useSEO).
    const canonical = page.locator('link[rel="canonical"]').first();
    const { origin } = new URL(page.url());
    await expect(canonical).toHaveAttribute("href", `${origin}${path}`);

    expect(errors).toEqual([]);
  });
}
