// /api/sitemap — XML sitemap, public (also reachable at /sitemap.xml via
// the rewrite in public/_redirects). Reads the same products store as
// /api/products so URLs stay in sync.

import { makeStore } from "./_lib/kv-store.js";

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

export const onRequestGet = async ({ request, env }) => {
  const reqUrl = new URL(request.url);
  const safeProto = reqUrl.protocol === "http:" ? "http" : "https";
  const headerHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    reqUrl.host ||
    "canvhub.com";
  const safeHost = /^[a-zA-Z0-9.\-:]+$/.test(headerHost)
    ? headerHost
    : "canvhub.com";
  const origin = `${safeProto}://${safeHost}`;

  let products = [];
  try {
    if (env.PRODUCTS) {
      const store = makeStore(env.PRODUCTS);
      const data = await store.get(PRODUCTS_KEY, { type: "json" });
      products = Array.isArray(data) ? data : [];
    }
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

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
};
