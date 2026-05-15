import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveNewUserModalVariant,
  sendNewUserModalEvent,
  resetNewUserModalVariant,
} from "@/lib/newuser-modal-variant";
import { DEFAULT_NEW_USER_MODAL } from "@/contexts/StorefrontConfigContext";
import type { NewUserModalConfig } from "@/contexts/StorefrontConfigContext";

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

const makeModal = (
  overrides: Partial<NewUserModalConfig["variantB"]> = {},
): NewUserModalConfig => ({
  ...DEFAULT_NEW_USER_MODAL,
  headline: "Hello A",
  body: "Body A",
  voucherCode: "WELCOMEA",
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

describe("resolveNewUserModalVariant", () => {
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
      ...DEFAULT_NEW_USER_MODAL,
      variantB: { ...DEFAULT_NEW_USER_MODAL.variantB, enabled: false },
    });
    expect(result.variant).toBe("a");
    expect(result.headline).toBe(DEFAULT_NEW_USER_MODAL.headline);
  });

  it("returns variant A when weight is 0", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const result = resolveNewUserModalVariant(makeModal({ weight: 0 }));
    expect(result.variant).toBe("a");
    expect(result.headline).toBe("Hello A");
  });

  it("returns variant B when weight is 100 and persists the assignment", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    const result = resolveNewUserModalVariant(makeModal({ weight: 100 }));
    expect(result.variant).toBe("b");
    expect(result.voucherCode).toBe("WELCOMEB");
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBe("b");
  });

  it("returns variant A when there is no visitor id yet", () => {
    // No canvhub_visitor_id set.
    const result = resolveNewUserModalVariant(makeModal({ weight: 50 }));
    expect(result.variant).toBe("a");
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBeNull();
  });

  it("respects a previously persisted assignment", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    storage.setItem("canvhub:newuser-modal:variant", "b");
    const result = resolveNewUserModalVariant(makeModal({ weight: 1 }));
    expect(result.variant).toBe("b");
  });

  it("is stable for the same visitor id (deterministic bucketing)", () => {
    storage.setItem("canvhub_visitor_id", "visitor-stable");
    const modal = makeModal({ weight: 50 });
    const first = resolveNewUserModalVariant(modal).variant;

    // Wipe the persisted variant so the second call has to re-derive
    // from the visitor id alone — the result must match.
    storage.removeItem("canvhub:newuser-modal:variant");
    const second = resolveNewUserModalVariant(modal).variant;
    expect(first).toBe(second);
  });

  it("returns variant B's voucher when assigned, even if blank (falls back to empty)", () => {
    storage.setItem("canvhub_visitor_id", "visitor-1");
    storage.setItem("canvhub:newuser-modal:variant", "b");
    const result = resolveNewUserModalVariant(makeModal({ voucherCode: "" }));
    expect(result.variant).toBe("b");
    expect(result.voucherCode).toBe("");
  });

  it("splits a large set of visitor ids roughly by weight", () => {
    const modal = makeModal({ weight: 70 });
    let bCount = 0;
    const total = 500;
    for (let i = 0; i < total; i++) {
      storage.setItem("canvhub_visitor_id", `visitor-${i}`);
      storage.removeItem("canvhub:newuser-modal:variant");
      if (resolveNewUserModalVariant(modal).variant === "b") bCount++;
    }
    // Expect ~70% B with a generous tolerance of ±15 percentage points.
    expect(bCount / total).toBeGreaterThan(0.55);
    expect(bCount / total).toBeLessThan(0.85);
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

  it("no-ops when there is no visitor id", () => {
    sendNewUserModalEvent("a", "impression");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the beacon when visitor id is present", () => {
    storage.setItem("canvhub_visitor_id", "visitor-xyz");
    sendNewUserModalEvent("b", "submit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/newuser-modal-events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({
      sessionId: "visitor-xyz",
      variant: "b",
      eventType: "submit",
    });
  });

  it("does not throw when fetch rejects", () => {
    storage.setItem("canvhub_visitor_id", "visitor-xyz");
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(() => sendNewUserModalEvent("a", "copy")).not.toThrow();
  });
});

describe("resetNewUserModalVariant", () => {
  it("removes the persisted assignment", () => {
    const storage = makeMemoryStorage();
    storage.setItem("canvhub:newuser-modal:variant", "b");
    vi.stubGlobal("window", { localStorage: storage });
    resetNewUserModalVariant();
    expect(storage.getItem("canvhub:newuser-modal:variant")).toBeNull();
    vi.unstubAllGlobals();
  });
});
