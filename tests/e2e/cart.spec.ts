import { test, expect, type Page } from "@playwright/test";

/**
 * Cart e2e — Verifies the PWA-shortcut deep link (`/?open=cart`) opens
 * the cart drawer on mount and scrubs the `?open=cart` query param from
 * the URL. Adding to cart end-to-end requires a real product (which
 * the `vite preview` build doesn't have), so live add-to-cart flows
 * are covered by the production smoke run
 * (`BASE_URL=https://canvhub.com npm run test:e2e`).
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

test.describe("cart", () => {
  test("PWA shortcut /?open=cart opens the cart drawer and scrubs the query param", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?open=cart");

    // The cart drawer is rendered as a side-sheet. We look for any
    // element that exposes a "Cart" / "Your cart" heading or aria
    // label — covers both the empty-state copy and the populated
    // drawer.
    const cartHeading = page
      .getByRole("heading", { name: /cart/i })
      .or(page.getByRole("dialog", { name: /cart/i }))
      .first();
    await expect(cartHeading).toBeVisible({ timeout: 15_000 });

    // The bridge should scrub `?open=cart` from the URL so a
    // refresh / back-nav doesn't re-open the drawer.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("open"), {
        timeout: 5_000,
      })
      .toBeNull();

    expect(errors).toEqual([]);
  });
});
