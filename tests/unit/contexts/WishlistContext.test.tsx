// @vitest-environment happy-dom
//
// Component test for `<WishlistProvider>` and `useWishlist()`. Mounts
// the provider into a happy-dom-backed React tree and asserts against
// the hook's public surface (add / remove / toggle / clear / has /
// ids / count / items) plus the localStorage + /api/wishlist sync
// contract.
//
// We mock `useUserAuth` directly so the provider sees a controllable
// auth state without pulling the entire `UserAuthProvider` tree.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

const useUserAuthMock = vi.fn();
vi.mock("@/contexts/UserAuthContext", () => ({
  useUserAuth: () => useUserAuthMock(),
}));
vi.mock("@/lib/api", () => ({
  jsonAuthHeaders: () => ({ "Content-Type": "application/json" }),
}));

import { WishlistProvider, useWishlist } from "@/contexts/WishlistContext";

const GUEST_KEY = "canvhub_wishlist_guest";
const userKey = (id: string) => `canvhub_wishlist_user_${id}`;

// Helper: probe component that exposes the wishlist hook value via a
// ref so individual tests can call methods + read the latest state
// outside of React's render cycle.
type ProbeHandle = ReturnType<typeof useWishlist>;
const probeRef: { current: ProbeHandle | null } = { current: null };

const Probe = () => {
  // See CartContext.test.tsx for why this assignment is deliberate.
  // eslint-disable-next-line react-hooks/immutability
  probeRef.current = useWishlist();
  return null;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const mount = async (children: ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<WishlistProvider>{children}</WishlistProvider>);
  });
};

const unmount = async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  probeRef.current = null;
};

const flushAsync = async () => {
  // Drains pending microtasks so the provider's fetch follow-ups run.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("WishlistProvider — guest user", () => {
  beforeEach(() => {
    localStorage.clear();
    useUserAuthMock.mockReturnValue({ user: null });
    vi.stubGlobal("fetch", vi.fn() as unknown as typeof fetch);
  });

  afterEach(async () => {
    await unmount();
    vi.unstubAllGlobals();
    useUserAuthMock.mockReset();
  });

  it("starts empty when localStorage is empty", async () => {
    await mount(<Probe />);
    expect(probeRef.current!.items).toEqual([]);
    expect(probeRef.current!.count).toBe(0);
    expect(probeRef.current!.has("anything")).toBe(false);
  });

  it("hydrates from the guest localStorage bucket on first mount", async () => {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify([
        { id: "p1", title: "Sunrise", addedAt: "2024-12-01T00:00:00Z" },
      ]),
    );
    await mount(<Probe />);
    expect(probeRef.current!.items).toHaveLength(1);
    expect(probeRef.current!.items[0].id).toBe("p1");
    expect(probeRef.current!.has("p1")).toBe(true);
  });

  it("ignores malformed localStorage payloads", async () => {
    localStorage.setItem(GUEST_KEY, "not-json{");
    await mount(<Probe />);
    expect(probeRef.current!.items).toEqual([]);
  });

  it("add() inserts an entry and persists to localStorage", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.add({ id: "p1", title: "Sunrise" });
    });
    expect(probeRef.current!.count).toBe(1);
    expect(probeRef.current!.items[0]).toMatchObject({
      id: "p1",
      title: "Sunrise",
    });
    expect(probeRef.current!.items[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const stored = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("p1");
  });

  it("add() is a no-op for an id that's already in the list", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.add({ id: "p1" });
    });
    const firstAddedAt = probeRef.current!.items[0].addedAt;
    await act(async () => {
      probeRef.current!.add({ id: "p1", title: "Different" });
    });
    expect(probeRef.current!.count).toBe(1);
    expect(probeRef.current!.items[0].addedAt).toBe(firstAddedAt);
  });

  it("remove() drops the entry from both state and localStorage", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.add({ id: "p1" });
      probeRef.current!.add({ id: "p2" });
    });
    await act(async () => {
      probeRef.current!.remove("p1");
    });
    expect(probeRef.current!.count).toBe(1);
    expect(probeRef.current!.ids.has("p1")).toBe(false);
    expect(probeRef.current!.ids.has("p2")).toBe(true);

    const stored = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");
    expect(stored.map((e: { id: string }) => e.id)).toEqual(["p2"]);
  });

  it("toggle() adds an entry that isn't already in the list", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.toggle({ id: "p1", title: "Sunrise" });
    });
    expect(probeRef.current!.has("p1")).toBe(true);
    expect(probeRef.current!.count).toBe(1);
  });

  it("toggle() removes an entry that's already in the list", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.add({ id: "p1" });
    });
    expect(probeRef.current!.has("p1")).toBe(true);
    await act(async () => {
      probeRef.current!.toggle({ id: "p1" });
    });
    expect(probeRef.current!.has("p1")).toBe(false);
    expect(probeRef.current!.count).toBe(0);
  });

  it("clear() empties the list and the localStorage bucket", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.add({ id: "p1" });
      probeRef.current!.add({ id: "p2" });
    });
    await act(async () => {
      probeRef.current!.clear();
    });
    expect(probeRef.current!.count).toBe(0);
    expect(localStorage.getItem(GUEST_KEY)).toBe("[]");
  });

  it("never calls /api/wishlist while signed out", async () => {
    await mount(<Probe />);
    await flushAsync();
    await act(async () => {
      probeRef.current!.add({ id: "p1" });
      probeRef.current!.toggle({ id: "p2" });
      probeRef.current!.remove("p2");
    });
    await flushAsync();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("WishlistProvider — signed-in user", () => {
  const userA = { id: "u-1", email: "a@example.com" };

  beforeEach(() => {
    localStorage.clear();
    useUserAuthMock.mockReturnValue({ user: userA });
  });

  afterEach(async () => {
    await unmount();
    vi.unstubAllGlobals();
    useUserAuthMock.mockReset();
  });

  it("merges guest items into the user's bucket on first signed-in mount", async () => {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify([{ id: "guest-1", addedAt: "2024-12-01T00:00:00Z" }]),
    );
    localStorage.setItem(
      userKey(userA.id),
      JSON.stringify([{ id: "user-1", addedAt: "2024-11-01T00:00:00Z" }]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/wishlist") {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      }) as unknown as typeof fetch,
    );

    await mount(<Probe />);
    await flushAsync();

    const ids = probeRef.current!.items.map((e) => e.id).sort();
    expect(ids).toEqual(["guest-1", "user-1"]);
    expect(localStorage.getItem(GUEST_KEY)).toBeNull();
    const persisted = JSON.parse(
      localStorage.getItem(userKey(userA.id)) || "[]",
    );
    expect(persisted.map((e: { id: string }) => e.id).sort()).toEqual([
      "guest-1",
      "user-1",
    ]);
  });

  it("PUTs to /api/wishlist after a mutation when the endpoint is configured", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/wishlist" && (!init || init.method === undefined)) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        if (url === "/api/wishlist" && init?.method === "PUT") {
          const body = JSON.parse((init.body as string) || "{}");
          return new Response(JSON.stringify({ items: body.items || [] }), {
            status: 200,
          });
        }
        return new Response("nope", { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    await act(async () => {
      probeRef.current!.add({ id: "p-new", title: "New" });
    });
    await flushAsync();

    const putCalls = fetchMock.mock.calls.filter(
      ([, init]) =>
        typeof init === "object" && init !== null && init.method === "PUT",
    );
    expect(putCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((putCalls[0][1] as RequestInit).body as string);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["p-new"]);
  });

  it("stops calling the server after a 503 so we don't spam an unconfigured binding", async () => {
    const fetchMock = vi.fn(
      async () => new Response("unconfigured", { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    const callsAfterMount = fetchMock.mock.calls.length;

    await act(async () => {
      probeRef.current!.add({ id: "p-1" });
      probeRef.current!.add({ id: "p-2" });
      probeRef.current!.remove("p-1");
    });
    await flushAsync();

    // 503 came back on the initial GET, so all subsequent mutations
    // should skip the network entirely.
    expect(fetchMock.mock.calls.length).toBe(callsAfterMount);
    // …and the local state should still be authoritative.
    expect(probeRef.current!.items.map((i) => i.id)).toEqual(["p-2"]);
  });

  it("survives a network error during the initial probe", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    // Local state still works; the provider didn't throw.
    await act(async () => {
      probeRef.current!.add({ id: "offline-1" });
    });
    expect(probeRef.current!.items[0].id).toBe("offline-1");
  });
});

describe("WishlistProvider — user switch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })) as unknown as Mock,
    );
  });

  afterEach(async () => {
    await unmount();
    vi.unstubAllGlobals();
    useUserAuthMock.mockReset();
  });

  it("swaps the local bucket when the active user changes", async () => {
    const userA = { id: "u-A", email: "a@example.com" };
    const userB = { id: "u-B", email: "b@example.com" };
    localStorage.setItem(
      userKey(userA.id),
      JSON.stringify([{ id: "from-a", addedAt: "2024-11-01T00:00:00Z" }]),
    );
    localStorage.setItem(
      userKey(userB.id),
      JSON.stringify([{ id: "from-b", addedAt: "2024-10-01T00:00:00Z" }]),
    );

    useUserAuthMock.mockReturnValue({ user: userA });
    await mount(<Probe />);
    await flushAsync();
    expect(probeRef.current!.items.map((i) => i.id)).toEqual(["from-a"]);

    // Simulate the auth state changing to user B by re-rendering with
    // the new mock value. React calls the user-effect once the value
    // identity changes.
    useUserAuthMock.mockReturnValue({ user: userB });
    await act(async () => {
      root!.render(
        <WishlistProvider>
          <Probe />
        </WishlistProvider>,
      );
    });
    await flushAsync();
    expect(probeRef.current!.items.map((i) => i.id)).toEqual(["from-b"]);
  });
});
