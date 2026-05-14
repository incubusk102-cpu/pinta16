import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface FakeKv {
  get: (key: string, type?: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

const buildKv = (initial: Record<string, string> = {}): FakeKv => {
  const store: Record<string, string> = { ...initial };
  return {
    get: async (key) => (key in store ? store[key] : null),
    put: async (key, value) => {
      store[key] = value;
    },
    delete: async (key) => {
      delete store[key];
    },
  };
};

const mockEnv = (kv: FakeKv) => {
  vi.doMock("../../../functions/api/_lib/context.js", () => ({
    getCloudflareEnv: () => ({
      TIKTOK_CLIENT_KEY: "test-client-key",
      TIKTOK_CLIENT_SECRET: "test-client-secret",
      STOREFRONT_CONFIG: kv,
    }),
    setCloudflareContext: () => {},
    requireKvBinding: () => kv,
  }));
};

const validAuth = () =>
  JSON.stringify({
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_expires_at: Math.floor(Date.now() / 1000) + 86400,
  });

describe("initPhotoPost — TikTok content posting body shape", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { publish_id: "p_pub_url~v2.test" },
            error: { code: "ok", message: "" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.doUnmock("../../../functions/api/_lib/context.js");
  });

  it("sends photo_images as bare HTTPS URL strings (not {image_url} objects)", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");

    const result = await mod.initPhotoPost({
      imageUrls: [
        "https://canvhub.com/api/r/products/aa/bb.webp",
        "https://canvhub.com/api/r/products/cc/dd.webp",
      ],
      caption: "Test caption",
      postMode: "MEDIA_UPLOAD",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v2/post/publish/content/init/");
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.media_type).toBe("PHOTO");
    expect(body.post_mode).toBe("MEDIA_UPLOAD");
    expect(body.source_info?.source).toBe("PULL_FROM_URL");
    expect(body.source_info?.photo_cover_index).toBe(0);
    expect(body.source_info?.photo_images).toEqual([
      "https://canvhub.com/api/r/products/aa/bb.webp",
      "https://canvhub.com/api/r/products/cc/dd.webp",
    ]);
  });

  it("omits DIRECT_POST-only fields from post_info in MEDIA_UPLOAD mode", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");

    const result = await mod.initPhotoPost({
      imageUrls: ["https://canvhub.com/img.webp"],
      caption: "Test caption",
      postMode: "MEDIA_UPLOAD",
      privacyLevel: "PUBLIC_TO_EVERYONE",
      disableComment: true,
      autoAddMusic: true,
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.post_info).toEqual({
      title: "Test caption",
      description: "Test caption",
    });
    expect(body.post_info).not.toHaveProperty("privacy_level");
    expect(body.post_info).not.toHaveProperty("disable_comment");
    expect(body.post_info).not.toHaveProperty("auto_add_music");
    expect(body.post_info).not.toHaveProperty("brand_content_toggle");
    expect(body.post_info).not.toHaveProperty("brand_organic_toggle");
  });

  it("includes DIRECT_POST-only fields in post_info when post_mode is DIRECT_POST", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");

    const result = await mod.initPhotoPost({
      imageUrls: ["https://canvhub.com/img.webp"],
      caption: "Test caption",
      postMode: "DIRECT_POST",
      privacyLevel: "PUBLIC_TO_EVERYONE",
      disableComment: true,
      autoAddMusic: false,
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.post_mode).toBe("DIRECT_POST");
    expect(body.post_info).toMatchObject({
      title: "Test caption",
      description: "Test caption",
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_comment: true,
      auto_add_music: false,
      brand_content_toggle: false,
      brand_organic_toggle: false,
    });
  });

  it("rejects non-HTTPS image URLs", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.initPhotoPost({
      imageUrls: ["http://insecure.example.com/x.jpg"],
      caption: "x",
    });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("HTTPS");
  });

  it("returns the publish_id on success", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.initPhotoPost({
      imageUrls: ["https://canvhub.com/img.webp"],
      caption: "hello",
    });
    expect(result.ok).toBe(true);
    expect(result.publishId).toBe("p_pub_url~v2.test");
  });
});
