import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveNewUserModalVariant,
  previewNewUserModalVariant,
  sendNewUserModalEvent,
  resetNewUserModalVariant,
} from "@/lib/newuser-modal-variant";
import { DEFAULT_NEW_USER_MODAL } from "@/contexts/StorefrontConfigContext";
import type {
  NewUserModalConfig,
  NewUserModalVariant,
} from "@/contexts/StorefrontConfigContext";

// Minimum localStorage stub to satisfy the helpers — same pattern used
// in `cart-storage.test.ts`.
const makeMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };
};

// Build a legacy-shape config (top-level + `variantB`) so we can verify
// the resolver still works against pre-rollout KV blobs.
const makeLegacyModal = (
  overrides: Partial<NewUserModalConfig["variantB"]> = {},
): NewUserModalConfig => ({
  ...DEFAULT_NEW_USER_MODAL,
  headline: "Hello A",
  body: "Body A",
  voucherCode: "WELCOMEA",
  // Force the synthesise path: no explicit variants[] so the resolver
  // must reconstruct A/B from the legacy fields.
  variants: [],
  variantsEnabled: false,
  variantB: {
    ...DEFAULT_NEW_USER_MODAL.variantB,
    enabled: true,
    weight: 50,
    headline: "Hello B",
    body: "Body B",
    voucherCode: "WELCOMEB",
    ...overrides,
  },
});

// Build an N-variant config — `variants[]` is authoritative, the
// top-level + variantB fields just mirror variants[0]/variants[1].
const makeNVariantModal = (
  variants: NewUserModalVariant[],
  variantsEnabled = true,
): NewUserModalConfig => ({
  ...DEFAULT_NEW_USER_MODAL,
  headline: variants[0]?.headline ?? "",
  body: variants[0]?.body ?? "",
  voucherCode: variants[0]?.voucherCode ?? "",
  variants,
  variantsEnabled,
  variantB: {
    enabled: false,
    weight: 0,
    headline: "",
    body: "",
    voucherCode: "",
  },
});

const v = (
  id: string,
  weight: number,
  copy: Partial<Omit<NewUserModalVariant, "id" | "weight">> = {},
): NewUserModalVariant => ({
  id,
  label: copy.label ?? id.toUpperCase(),
  weight,
  headline: copy.headline ?? `Headline ${id}`,
  body: copy.body ?? `Body ${id}`,
  voucherCode: copy.voucherCode ?? `CODE${id.toUpperCase()}`,
});

// Cheap deterministic pseudo-UUIDs for traffic-split tests. Real
// visitor ids minted by the SPA are RFC4122 UUIDs, which distribute
// uniformly under djb2 mod 1000; a structured `visitor-N` string
// bunches up enough at N<1000 to break the tolerances below.
const makeUuidLike = (seed: number): string => {
  // xorshift32 stretched to ~32 chars of base36 noise — much closer to
  // a UUID's entropy than a counter.
  let s = (seed + 1) >>> 0;
  let out = "";
  for (let i = 0; i < 6; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out += (s >>> 0).toString(36).padStart(6, "0");
  }
  return out;
};

describe("resolveNewUserModalVariant (legacy shape)", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeMemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns variant A when variantB is disabled", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const result = resolveNewUserModalVariant({
      ...makeLegacyModal(),
      variantB: { ...DEFAULT_NEW_USER_MODAL.variantB, enabled: false },
    });
    expect(result.variant).toBe("a");
    expect(result.headline).toBe("Hello A");
  });

  it("returns variant A when weight is 0", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const result = resolveNewUserModalVariant(makeLegacyModal({ weight: 0 }));
    expect(result.variant).toBe("a");
    expect(result.headline).toBe("Hello A");
  });

  it("returns variant B when weight is 100 and persists the assignment", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const result = resolveNewUserModalVariant(makeLegacyModal({ weight: 100 }));
    expect(result.variant).toBe("b");
    expect(result.voucherCode).toBe("WELCOMEB");
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBe("b");
  });

  it("returns variant A when there is no visitor id yet", () => {
    const result = resolveNewUserModalVariant(makeLegacyModal({ weight: 50 }));
    expect(result.variant).toBe("a");
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBeNull();
  });

  it("respects a previously persisted assignment", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    storage.setItem("canvhub:newuser-modal:variant", "b");
    const result = resolveNewUserModalVariant(makeLegacyModal({ weight: 1 }));
    expect(result.variant).toBe("b");
  });

  it("is stable for the same visitor id (deterministic bucketing)", () => {
    storage.setItem("canvhub_visitor_id", "visitor-stable");
    const modal = makeLegacyModal({ weight: 50 });
    const first = resolveNewUserModalVariant(modal).variant;
    storage.removeItem("canvhub:newuser-modal:variant");
    const second = resolveNewUserModalVariant(modal).variant;
    expect(first).toBe(second);
  });

  it("splits a large set of visitor ids roughly by weight", () => {
    const modal = makeLegacyModal({ weight: 70 });
    let bCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      // UUID-shaped ids mimic the real visitor ids minted in the SPA;
      // sequential `visitor-N` is too structured for djb2 to spread
      // uniformly mod 1000 with a small sample.
      storage.setItem("canvhub_visitor_id", makeUuidLike(i));
      storage.removeItem("canvhub:newuser-modal:variant");
      if (resolveNewUserModalVariant(modal).variant === "b") bCount++;
    }
    expect(bCount / total).toBeGreaterThan(0.55);
    expect(bCount / total).toBeLessThan(0.85);
  });
});

describe("resolveNewUserModalVariant (N-variant shape)", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeMemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always returns variants[0] when variantsEnabled is false", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const modal = makeNVariantModal(
      [v("a", 25), v("b", 25), v("c", 50)],
      false,
    );
    const result = resolveNewUserModalVariant(modal);
    expect(result.variant).toBe("a");
    expect(result.headline).toBe("Headline a");
  });

  it("returns variants[0] when only one variant is configured", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const modal = makeNVariantModal([v("a", 100)], true);
    const result = resolveNewUserModalVariant(modal);
    expect(result.variant).toBe("a");
  });

  it("buckets visitors deterministically across 3 variants by weight", () => {
    const modal = makeNVariantModal([v("a", 10), v("b", 30), v("c", 60)], true);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const total = 2000;
    for (let i = 0; i < total; i++) {
      storage.setItem("canvhub_visitor_id", makeUuidLike(i));
      storage.removeItem("canvhub:newuser-modal:variant");
      const id = resolveNewUserModalVariant(modal).variant;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts.a / total).toBeGreaterThan(0.05);
    expect(counts.a / total).toBeLessThan(0.18);
    expect(counts.b / total).toBeGreaterThan(0.22);
    expect(counts.b / total).toBeLessThan(0.38);
    expect(counts.c / total).toBeGreaterThan(0.52);
    expect(counts.c / total).toBeLessThan(0.68);
  });

  it("accepts arbitrary variant ids (slug-shaped)", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const modal = makeNVariantModal(
      [v("control", 50), v("v2-bigger-cta", 50)],
      true,
    );
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      storage.setItem("canvhub_visitor_id", `visitor-${i}`);
      storage.removeItem("canvhub:newuser-modal:variant");
      seen.add(resolveNewUserModalVariant(modal).variant);
    }
    // With 50 different visitor ids both variants should land at
    // least once at 50/50.
    expect(seen).toContain("control");
    expect(seen).toContain("v2-bigger-cta");
  });

  it("normalises weights that don't sum to 100", () => {
    const modal = makeNVariantModal([v("a", 1), v("b", 1)], true);
    let bCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      storage.setItem("canvhub_visitor_id", makeUuidLike(i));
      storage.removeItem("canvhub:newuser-modal:variant");
      if (resolveNewUserModalVariant(modal).variant === "b") bCount++;
    }
    // 1:1 split — expect ~50% with generous tolerance.
    expect(bCount / total).toBeGreaterThan(0.35);
    expect(bCount / total).toBeLessThan(0.65);
  });

  it("re-rolls when the persisted variant id no longer matches any configured variant", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    storage.setItem("canvhub:newuser-modal:variant", "removed-variant");
    const modal = makeNVariantModal([v("a", 50), v("b", 50)], true);
    const result = resolveNewUserModalVariant(modal);
    expect(["a", "b"]).toContain(result.variant);
    // Should have re-persisted with a real id from the current config.
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBe(
      result.variant,
    );
  });

  it("returns variants[0] when all weights are zero", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const modal = makeNVariantModal([v("a", 0), v("b", 0), v("c", 0)], true);
    const result = resolveNewUserModalVariant(modal);
    expect(result.variant).toBe("a");
  });

  it("pins to the single non-zero variant when only one is weighted", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const modal = makeNVariantModal([v("a", 0), v("b", 0), v("c", 100)], true);
    const result = resolveNewUserModalVariant(modal);
    expect(result.variant).toBe("c");
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBe("c");
  });
});

describe("previewNewUserModalVariant", () => {
  it("returns the copy for the requested variant id", () => {
    const modal = makeNVariantModal([v("a", 50), v("b", 25), v("c", 25)], true);
    const result = previewNewUserModalVariant(modal, "c");
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("c");
    expect(result?.headline).toBe("Headline c");
    expect(result?.voucherCode).toBe("CODEC");
  });

  it("returns null when the id doesn't match", () => {
    const modal = makeNVariantModal([v("a", 100)], false);
    expect(previewNewUserModalVariant(modal, "z")).toBeNull();
  });
});

describe("sendNewUserModalEvent", () => {
  let storage: Storage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = makeMemoryStorage();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /api/newuser-modal-events with the session id + variant", () => {
    storage.setItem("canvhub_visitor_id", "visitor-xyz");
    sendNewUserModalEvent("b", "impression");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/newuser-modal-events");
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      sessionId: "visitor-xyz",
      variant: "b",
      eventType: "impression",
    });
  });

  it("accepts arbitrary slug-shaped variant ids", () => {
    storage.setItem("canvhub_visitor_id", "visitor-xyz");
    sendNewUserModalEvent("v2-bigger-cta", "copy");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.variant).toBe("v2-bigger-cta");
  });

  it("does not fire when there's no visitor id", () => {
    sendNewUserModalEvent("a", "impression");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fire when the variant id is invalid", () => {
    storage.setItem("canvhub_visitor_id", "visitor-xyz");
    sendNewUserModalEvent("UPPER CASE!", "impression");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resetNewUserModalVariant", () => {
  it("clears the persisted variant", () => {
    const storage = makeMemoryStorage();
    storage.setItem("canvhub:newuser-modal:variant", "b");
    vi.stubGlobal("window", { localStorage: storage });
    resetNewUserModalVariant();
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBeNull();
    vi.unstubAllGlobals();
  });
});
