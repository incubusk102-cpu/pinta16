/**
 * Design preview generator. Renders every email template with realistic
 * sample data and writes the resulting HTML files into ./preview-out/
 * so we can screenshot them in a headless browser without standing up
 * a full preview server.
 *
 * Run with:
 *   npx tsx src/emails/preview/preview.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  renderInactiveDeletionEmail,
  renderNewOrderAdminAlert,
  renderOrderEmail,
  renderVoucherEmail,
  renderWelcomeEmail,
} from "../render";
import type {
  OrderEmailConfig,
  OrderEmailKind,
  OrderRecord,
  WelcomeEmailConfig,
} from "../types";

// ---------------------------------------------------------------------------
// Sample data — chosen to exercise every visual feature: thumbnails,
// long item titles, tracking numbers, refund amounts, footer links,
// admin-tunable colors / styles.
// ---------------------------------------------------------------------------

const SAMPLE_ORDER: OrderRecord = {
  id: "CH-2611",
  status: "out_for_delivery",
  items: [
    {
      id: "p1",
      title: "Bukid Sa Bayanihan",
      quantity: 1,
      price: 8500,
      image:
        "https://images.unsplash.com/photo-1549887534-1541e9326642?auto=format&w=200&h=200&fit=crop",
    },
    {
      id: "p2",
      title: "Dapithapon — Sunset on Lake Buhi",
      quantity: 1,
      price: 6200,
      image:
        "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?auto=format&w=200&h=200&fit=crop",
    },
    {
      id: "p3",
      title: "Custom 16×20 Frame",
      quantity: 2,
      price: 750,
    },
  ],
  subtotal: 16200,
  shippingFee: 250,
  discount: 500,
  total: 15950,
  voucherCode: "WELCOME500",
  orderInfo: {
    fullName: "Maria Santos",
    email: "maria@example.com",
    phone: "+63 917 555 0123",
  },
};

const SAMPLE_ORDER_CHROME: OrderEmailConfig = {
  fromName: "Canvas Hub",
  primaryColor: "#1c1c1c",
  accentColor: "#7a7468",
  bodyFont: "inter",
  template: "classic",
  headerAlign: "left",
  dividerStyle: "line",
  buttonStyle: "filled",
  showLogo: true,
  showBanner: false,
  footerTagline: "original Filipino products",
  footerLinks: [
    {
      id: "ig",
      kind: "instagram",
      label: "Instagram",
      url: "https://instagram.com/canvhub",
    },
    {
      id: "fb",
      kind: "facebook",
      label: "Facebook",
      url: "https://facebook.com/canvhub",
    },
    {
      id: "site",
      kind: "globe",
      label: "canvhub.com",
      url: "https://canvhub.com",
    },
  ],
  trackButtonText: "Track shipment",
  reviewButtonText: "Write a review",
};

const SAMPLE_WELCOME: WelcomeEmailConfig = {
  fromName: "Canvas Hub",
  subject: "Welcome to Canvas Hub, {{firstName}}",
  body: "Thanks for joining the Canvas Hub community — a small studio in the Philippines that ships original products to collectors around the country.\n\nWe handpicked a few new pieces for you below, and there's a small welcome gift to mark the occasion. We're glad you're here.",
  signature: "— Sam, Curator at Canvas Hub",
  primaryColor: "#1c1c1c",
  accentColor: "#7a7468",
  bodyFont: "inter",
  template: "classic",
  headerAlign: "left",
  dividerStyle: "brush",
  buttonStyle: "filled",
  showLogo: true,
  showBanner: false,
  showAvatar: true,
  avatarName: "Sam",
  ctaLabel: "Browse the gallery",
  ctaUrl: "https://canvhub.com",
  footerTagline: "original Filipino products",
  footerLinks: [
    {
      id: "ig",
      kind: "instagram",
      label: "Instagram",
      url: "https://instagram.com/canvhub",
    },
    {
      id: "fb",
      kind: "facebook",
      label: "Facebook",
      url: "https://facebook.com/canvhub",
    },
  ],
  products: { enabled: true, mode: "auto", count: 4 },
};

const SAMPLE_PRODUCTS = [
  {
    id: "p1",
    title: "Bukid Sa Bayanihan",
    price: 8500,
    imageUrl:
      "https://images.unsplash.com/photo-1549887534-1541e9326642?auto=format&w=400&h=400&fit=crop",
  },
  {
    id: "p2",
    title: "Dapithapon",
    price: 6200,
    imageUrl:
      "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?auto=format&w=400&h=400&fit=crop",
  },
  {
    id: "p3",
    title: "Sirena ng Talim",
    price: 9800,
    imageUrl:
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&w=400&h=400&fit=crop",
  },
  {
    id: "p4",
    title: "Bahay Kubo at Hapon",
    price: 5500,
    imageUrl:
      "https://images.unsplash.com/photo-1554907984-15263bfd63bd?auto=format&w=400&h=400&fit=crop",
  },
];

const SAMPLE_DISCOUNT = {
  headline: "Welcome gift",
  description: "Take 10% off your first product.",
  code: "WELCOME10",
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

const ALL_KINDS: OrderEmailKind[] = [
  "confirmed",
  "in_progress",
  "out_for_delivery",
  "received",
  "refund_requested",
  "refund_succeeded",
  "refund_failed",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, "../../../preview-out");

const writePreview = async (name: string, html: string) => {
  await writeFile(resolve(OUT_DIR, `${name}.html`), html, "utf-8");
  console.log(`  wrote preview-out/${name}.html (${html.length} bytes)`);
};

const main = async () => {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Rendering order kind previews...");
  for (const kind of ALL_KINDS) {
    const extra =
      kind === "out_for_delivery"
        ? {
            trackingUrl: "https://track.example.com/CH-2611",
            trackingNumber: "JT123456789PH",
            courier: "J&T Express",
          }
        : kind === "refund_requested" || kind === "refund_succeeded"
          ? { refundAmount: 15950 }
          : kind === "refund_failed"
            ? {
                refundAmount: 15950,
                refundFailureMessage: "card issuer declined",
              }
            : {};

    const rendered = await renderOrderEmail({
      kind,
      order: SAMPLE_ORDER,
      extra,
      config: SAMPLE_ORDER_CHROME,
    });
    await writePreview(`order-${kind}`, rendered.html);
  }

  console.log("Rendering welcome email...");
  const welcome = await renderWelcomeEmail({
    config: SAMPLE_WELCOME,
    user: { name: "Maria Santos", email: "maria@example.com" },
    discount: SAMPLE_DISCOUNT,
    products: SAMPLE_PRODUCTS,
  });
  await writePreview("welcome", welcome.html);

  console.log("Rendering new order admin alert...");
  const adminAlert = await renderNewOrderAdminAlert({
    order: SAMPLE_ORDER,
    config: SAMPLE_ORDER_CHROME,
  });
  await writePreview("admin-alert", adminAlert.html);

  console.log("Rendering voucher email...");
  const voucher = await renderVoucherEmail({
    code: "WELCOME10",
    config: SAMPLE_ORDER_CHROME,
  });
  await writePreview("voucher", voucher.html);

  console.log("Rendering inactive-deletion email...");
  const inactive = await renderInactiveDeletionEmail({
    user: { name: "Maria Santos", email: "maria@example.com" },
    inactiveDays: 365,
    signupUrl: "https://canvhub.com/signup",
    config: SAMPLE_ORDER_CHROME,
  });
  await writePreview("inactive-deletion", inactive.html);

  // Render an editorial template variant of the welcome email to show
  // the design system flexes when admin picks a different template.
  console.log("Rendering editorial template variant...");
  const editorial = await renderWelcomeEmail({
    config: {
      ...SAMPLE_WELCOME,
      template: "editorial",
      bodyFont: "garamond",
      dividerStyle: "brush",
      buttonStyle: "outline",
      headerAlign: "center",
    },
    user: { name: "Maria Santos", email: "maria@example.com" },
    discount: SAMPLE_DISCOUNT,
    products: SAMPLE_PRODUCTS.slice(0, 4),
  });
  await writePreview("welcome-editorial", editorial.html);

  // Build a single index.html that links to all previews so it's
  // easy to flip through them in a browser.
  const allFiles = await import("node:fs").then((m) =>
    m
      .readdirSync(OUT_DIR)
      .filter((f) => f.endsWith(".html") && f !== "index.html"),
  );
  const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Canvas Hub email previews</title>
<style>
body { font-family: 'Inter', system-ui, sans-serif; padding: 32px; background: #f5f3ee; color: #1c1c1c; }
h1 { font-family: 'Playfair Display', Georgia, serif; font-weight: 500; margin: 0 0 8px; }
p { color: #7a7468; margin: 0 0 20px; }
ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
li { background: #fff; border: 1px solid #e9e3d6; border-radius: 6px; padding: 14px 16px; }
a { color: #1c1c1c; text-decoration: none; font-weight: 500; }
a:hover { text-decoration: underline; }
.kind { display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #c4a86a; margin-bottom: 4px; }
</style>
</head>
<body>
<h1>Canvas Hub email previews</h1>
<p>Click any template below to preview the rendered HTML in your browser.</p>
<ul>
${allFiles
  .sort()
  .map(
    (f) =>
      `<li><span class="kind">${f.replace(".html", "").replace(/-/g, " · ")}</span><a href="./${f}">${f}</a></li>`,
  )
  .join("\n")}
</ul>
</body>
</html>`;
  await writeFile(resolve(OUT_DIR, "index.html"), indexHtml, "utf-8");
  console.log(
    `  wrote preview-out/index.html (catalog of ${allFiles.length} previews)`,
  );

  console.log(`\nDone. Open ${OUT_DIR}/index.html to flip through.`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
