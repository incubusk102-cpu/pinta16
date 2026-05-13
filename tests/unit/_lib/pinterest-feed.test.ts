import { describe, it, expect } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import { onRequestGet } from "../../../functions/api/pinterest-feed.js";

interface KvNamespace {
  get: (key: string, options?: { type?: string }) => Promise<unknown>;
}

const buildKv = (products: unknown): KvNamespace => ({
  get: async (key, options) => {
    if (key !== "all-products") return null;
    if (options?.type === "json") return products;
    return JSON.stringify(products);
  },
});

const callFeed = async (products: unknown) => {
  const env = { PRODUCTS: buildKv(products) };
  const request = new Request("https://canvhub.com/api/pinterest-feed", {
    method: "GET",
    headers: { host: "canvhub.com" },
  });
  const res = await onRequestGet({ request, env });
  return { status: res.status, body: await res.text(), headers: res.headers };
};

describe("pinterest-feed endpoint", () => {
  it("emits a Pinterest-spec CSV header row with required columns", async () => {
    const { status, body, headers } = await callFeed([]);
    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toContain("text/csv");
    const header = body.split("\r\n")[0];
    for (const col of [
      "id",
      "title",
      "description",
      "link",
      "image_link",
      "additional_image_link",
      "availability",
      "price",
      "sale_price",
      "brand",
      "condition",
      "product_type",
      "google_product_category",
    ]) {
      expect(header).toContain(`"${col}"`);
    }
  });

  it("renders a product row with absolute URLs, PHP price, and sale price", async () => {
    const products = [
      {
        id: "abc-123",
        title: "Rice Field Guardians",
        description: "Mosaic painting of women in conical hats.",
        image: "/api/r/products/aa/bb.webp",
        price: 3599,
        salePrice: 3199,
        availability: "available",
        category: "Folk Art",
        images: [
          { url: "/api/r/products/aa/bb.webp" },
          { url: "/api/r/products/cc/dd.webp" },
        ],
      },
    ];
    const { body } = await callFeed(products);
    const lines = body.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    const row = lines[1];
    expect(row).toContain('"abc-123"');
    expect(row).toContain('"Rice Field Guardians"');
    expect(row).toContain('"https://canvhub.com/product/abc-123"');
    expect(row).toContain('"https://canvhub.com/api/r/products/aa/bb.webp"');
    expect(row).toContain('"3599.00 PHP"');
    expect(row).toContain('"3199.00 PHP"');
    expect(row).toContain('"in stock"');
    expect(row).toContain('"Canvas Hub"');
    expect(row).toContain('"new"');
    expect(row).toContain('"Folk Art"');
  });

  it("maps internal availability to Pinterest values and skips drafts/reserved", async () => {
    const products = [
      {
        id: "a",
        title: "T",
        image: "/img/a.webp",
        price: 100,
        availability: "available",
      },
      {
        id: "b",
        title: "T",
        image: "/img/b.webp",
        price: 100,
        availability: "made-to-order",
      },
      {
        id: "c",
        title: "T",
        image: "/img/c.webp",
        price: 100,
        availability: "sold",
      },
      {
        id: "d",
        title: "T",
        image: "/img/d.webp",
        price: 100,
        availability: "draft",
      },
      {
        id: "e",
        title: "T",
        image: "/img/e.webp",
        price: 100,
        availability: "reserved",
      },
    ];
    const { body } = await callFeed(products);
    const rows = body.trim().split("\r\n").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('"in stock"');
    expect(rows[1]).toContain('"preorder"');
    expect(rows[2]).toContain('"out of stock"');
  });

  it("skips rows missing required fields (no title/image/price)", async () => {
    const products = [
      { id: "a", title: "", image: "/img/a.webp", price: 100 },
      { id: "b", title: "T", image: "", price: 100 },
      { id: "c", title: "T", image: "/img/c.webp", price: 0 },
      { id: "d", title: "T", image: "/img/d.webp", price: 100 },
    ];
    const { body } = await callFeed(products);
    const rows = body.trim().split("\r\n").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('"d"');
  });

  it("escapes embedded quotes and strips newlines/tabs from descriptions", async () => {
    const products = [
      {
        id: "a",
        title: 'Painting "X"',
        description: "Line1\nLine2\twith\ttabs",
        image: "/img/a.webp",
        price: 100,
        availability: "available",
      },
    ];
    const { body } = await callFeed(products);
    const row = body.trim().split("\r\n")[1];
    expect(row).toContain('"Painting ""X"""');
    expect(row).toContain('"Line1 Line2 with tabs"');
    expect(row).not.toContain("\n\n");
  });

  it("omits sale_price when not on sale and uses primary image as link", async () => {
    const products = [
      {
        id: "a",
        title: "T",
        image: "/img/a.webp",
        price: 1000,
        availability: "available",
      },
    ];
    const { body } = await callFeed(products);
    const row = body.trim().split("\r\n")[1];
    expect(row).toContain('"1000.00 PHP"');
    // sale_price column should be present but empty
    expect(row).toMatch(/"1000\.00 PHP","",/);
  });

  it("handles absent PRODUCTS binding gracefully (empty CSV with header)", async () => {
    const request = new Request("https://canvhub.com/api/pinterest-feed");
    const res = await onRequestGet({ request, env: {} });
    expect(res.status).toBe(200);
    const body = await res.text();
    const lines = body.trim().split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"id"');
  });
});
