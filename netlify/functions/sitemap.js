import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "products";
const PRODUCTS_KEY = "all-products";

const xmlEscape = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const STATIC_PATHS = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/account", priority: "0.4", changefreq: "weekly" },
  { path: "/login", priority: "0.2", changefreq: "yearly" },
  { path: "/signup", priority: "0.2", changefreq: "yearly" },
];

export const handler = async (event) => {
  // proto / host come from request headers, which are user-controlled.
  // Reject anything outside a strict allowlist so a crafted Host header
  // can't inject arbitrary characters into the sitemap.
  const safeProto = (() => {
    const v =
      event.headers?.["x-forwarded-proto"] ||
      event.headers?.["X-Forwarded-Proto"] ||
      "https";
    return v === "http" ? "http" : "https";
  })();
  const safeHost = (() => {
    const v =
      event.headers?.["x-forwarded-host"] ||
      event.headers?.host ||
      "pintaterra.com";
    // Allow only hostname-y characters: letters, digits, dots, hyphens, colons (port).
    return /^[a-zA-Z0-9.\-:]+$/.test(String(v)) ? String(v) : "pintaterra.com";
  })();
  const origin = `${safeProto}://${safeHost}`;

  let products = [];
  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);
    const data = await store.get(PRODUCTS_KEY, { type: "json" });
    products = Array.isArray(data) ? data : [];
  } catch {
    products = [];
  }

  const now = new Date().toISOString();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ];

  for (const route of STATIC_PATHS) {
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(`${origin}${route.path}`)}</loc>`);
    lines.push(`    <lastmod>${now}</lastmod>`);
    lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
    lines.push(`    <priority>${route.priority}</priority>`);
    lines.push("  </url>");
  }

  for (const p of products) {
    if (!p?.id) continue;
    if (p.availability === "draft") continue;
    const lastmod = xmlEscape(p.updatedAt || p.createdAt || now);
    const url = `${origin}/product/${encodeURIComponent(p.id)}`;
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(url)}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push("    <changefreq>weekly</changefreq>");
    lines.push("    <priority>0.7</priority>");
    if (p.image) {
      lines.push(
        `    <image:image><image:loc>${xmlEscape(
          p.image.startsWith("http") ? p.image : `${origin}${p.image}`,
        )}</image:loc></image:image>`,
      );
    }
    lines.push("  </url>");
  }

  lines.push("</urlset>");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
    body: lines.join("\n"),
  };
};
