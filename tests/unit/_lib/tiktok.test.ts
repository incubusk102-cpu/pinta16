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

describe("toTikTokImageUrl — Cloudflare Image Resizing wrapper", () => {
  const TRANSFORM =
    "format=jpeg,fit=pad,width=1080,height=1920,background=%23f5f3ee,quality=90";

  it("wraps a same-origin canvhub URL with the cdn-cgi/image transform", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const out = mod.toTikTokImageUrl(
      "https://canvhub.com/api/r/products/aa/bb.webp",
      { origin: "https://canvhub.com" },
    );
    expect(out).toBe(
      `https://canvhub.com/cdn-cgi/image/${TRANSFORM}/api/r/products/aa/bb.webp`,
    );
  });

  it("wraps the URL even when no origin is supplied", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const out = mod.toTikTokImageUrl(
      "https://canvhub.com/api/r/products/aa/bb.webp",
    );
    expect(out).toBe(
      `https://canvhub.com/cdn-cgi/image/${TRANSFORM}/api/r/products/aa/bb.webp`,
    );
  });

  it("does not double-wrap a URL that already has the cdn-cgi/image prefix", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const already = `https://canvhub.com/cdn-cgi/image/${TRANSFORM}/api/r/x.webp`;
    expect(
      mod.toTikTokImageUrl(already, { origin: "https://canvhub.com" }),
    ).toBe(already);
  });

  it("leaves cross-origin URLs untouched (we can't rewrite hosts we don't control)", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const external = "https://cdn.example.com/foo.jpg";
    expect(
      mod.toTikTokImageUrl(external, { origin: "https://canvhub.com" }),
    ).toBe(external);
  });

  it("leaves non-HTTPS and invalid inputs untouched", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    expect(mod.toTikTokImageUrl("http://canvhub.com/img.webp")).toBe(
      "http://canvhub.com/img.webp",
    );
    expect(mod.toTikTokImageUrl("")).toBe("");
    expect(mod.toTikTokImageUrl(null)).toBe(null);
    expect(mod.toTikTokImageUrl(undefined)).toBe(undefined);
  });

  it("preserves the query string when rewriting", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const out = mod.toTikTokImageUrl("https://canvhub.com/api/r/x.webp?v=2", {
      origin: "https://canvhub.com",
    });
    expect(out).toBe(
      `https://canvhub.com/cdn-cgi/image/${TRANSFORM}/api/r/x.webp?v=2`,
    );
  });
});

describe("pollPublishStatus — fail-fast mode", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.doUnmock("../../../functions/api/_lib/context.js");
  });

  const respondWith = (status: string) =>
    new Response(
      JSON.stringify({
        data: { status, uploaded_bytes: 0 },
        error: { code: "ok", message: "" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  it("returns ok:true with pending:true when status stays PROCESSING_UPLOAD", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    fetchMock = vi.fn(async () => respondWith("PROCESSING_UPLOAD"));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.pollPublishStatus("p_id_test", {
      timeoutMs: 100,
      failFast: true,
    });
    expect(result.ok).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.status).toBe("PROCESSING_UPLOAD");
  });

  it("still returns a hard timeout error when failFast is false", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    fetchMock = vi.fn(async () => respondWith("PROCESSING_UPLOAD"));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.pollPublishStatus("p_id_test", {
      timeoutMs: 100,
    });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("timed out");
  });

  it("returns the FAILED terminal state immediately even in failFast mode", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              status: "FAILED",
              fail_reason: "picture_size_check_failed",
            },
            error: { code: "ok", message: "" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.pollPublishStatus("p_id_test", {
      timeoutMs: 5000,
      failFast: true,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(String(result.error)).toContain("picture_size_check_failed");
  });

  it("returns SEND_TO_USER_INBOX as a terminal success", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    fetchMock = vi.fn(async () => respondWith("SEND_TO_USER_INBOX"));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.pollPublishStatus("p_id_test", {
      timeoutMs: 5000,
      failFast: true,
    });
    expect(result.ok).toBe(true);
    expect(result.pending).toBeUndefined();
    expect(result.status).toBe("SEND_TO_USER_INBOX");
  });

  it("forwards uploadedBytes in the pending result", async () => {
    mockEnv(buildKv({ tiktok_auth: validAuth() }));
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { status: "PROCESSING_DOWNLOAD", uploaded_bytes: 12345 },
            error: { code: "ok", message: "" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.pollPublishStatus("p_id_test", {
      timeoutMs: 100,
      failFast: true,
    });
    expect(result.ok).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.status).toBe("PROCESSING_DOWNLOAD");
    expect(result.uploadedBytes).toBe(12345);
  });
});

describe("publishProductPhoto — admin publish flow", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.doUnmock("../../../functions/api/_lib/context.js");
  });

  // Stub D1 with a no-op prepared-statement chain. publishProductPhoto only
  // needs INSERT/UPDATE writes to succeed; we don't care about the rows.
  const fakeD1 = () => ({
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
        first: async () => null,
      }),
    }),
  });

  const mockTikTokFetch = (...responses: object[]) => {
    let i = 0;
    const fetchMock = vi.fn(async () => {
      const payload = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    return fetchMock;
  };

  // publishProductPhoto hard-codes a 12s fail-fast poll with 2s intervals,
  // so this end-to-end test needs ~12s of real wallclock to drain the poll
  // loop. We bump the per-test timeout accordingly.
  it("forwards pending=true + uploadedBytes when TikTok stays in PROCESSING_DOWNLOAD", async () => {
    const kv = buildKv({ tiktok_auth: validAuth() });
    vi.doMock("../../../functions/api/_lib/context.js", () => ({
      getCloudflareEnv: () => ({
        TIKTOK_CLIENT_KEY: "test-client-key",
        TIKTOK_CLIENT_SECRET: "test-client-secret",
        STOREFRONT_CONFIG: kv,
        DB: fakeD1(),
      }),
      setCloudflareContext: () => {},
      requireKvBinding: () => kv,
    }));
    mockTikTokFetch(
      // initPhotoPost response
      {
        data: { publish_id: "p_pub_url~v2.test" },
        error: { code: "ok", message: "" },
      },
      // pollPublishStatus → PROCESSING_DOWNLOAD (non-terminal)
      {
        data: { status: "PROCESSING_DOWNLOAD", uploaded_bytes: 4096 },
        error: { code: "ok", message: "" },
      },
    );
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/tiktok.js");
    const result = await mod.publishProductPhoto({
      product: {
        id: "prod-test-1",
        title: "Test painting",
        image: "https://canvhub.com/img.webp",
      },
      origin: "https://canvhub.com",
      postMode: "MEDIA_UPLOAD",
    });
    expect(result.ok).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.status).toBe("PROCESSING_DOWNLOAD");
    expect(result.uploadedBytes).toBe(4096);
    expect(result.publishId).toBe("p_pub_url~v2.test");
    expect(result.shareUrl).toBeNull();
    expect(result.postId).toBeNull();
  }, 20_000);
});
