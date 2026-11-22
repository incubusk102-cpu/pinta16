// @vitest-environment happy-dom
//
// Component test for `<UserAuthProvider>` and `useUserAuth()`. Covers
// the cookie-based session boot probe, googleLogin / applySession /
// logout / refresh, and the address mutators that route through
// `callAction`. All `/api/users` traffic is mocked.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UserAuthProvider,
  useUserAuth,
  type PublicUser,
} from "@/contexts/UserAuthContext";

type ProbeHandle = ReturnType<typeof useUserAuth>;
const probeRef: { current: ProbeHandle | null } = { current: null };

const Probe = () => {
  // See CartContext.test.tsx for why this assignment is deliberate.
  // eslint-disable-next-line react-hooks/immutability
  probeRef.current = useUserAuth();
  return null;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const mount = async (children: ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<UserAuthProvider>{children}</UserAuthProvider>);
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
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const mockUser: PublicUser = {
  id: "u-1",
  email: "test@canvhub.com",
  name: "Test User",
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("UserAuthProvider — initial mount", () => {
  it("starts in a logged-out, loading state", async () => {
    // Hang the session probe so we can observe the loading=true window.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) as unknown as typeof fetch,
    );
    await mount(<Probe />);
    expect(probeRef.current!.token).toBeNull();
    expect(probeRef.current!.user).toBeNull();
    expect(probeRef.current!.loading).toBe(true);
    expect(probeRef.current!.rewards).toEqual([]);
  });

  it("restores an in-memory session from the HttpOnly cookie probe", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("action=session")) {
        return jsonResponse({ token: "tok-abc", user: mockUser });
      }
      if (url.includes("action=me")) {
        return jsonResponse({ user: mockUser, rewards: [] });
      }
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    expect(probeRef.current!.token).toBe("tok-abc");
    expect(probeRef.current!.user).toEqual(mockUser);
    expect(probeRef.current!.loading).toBe(false);
  });

  it("stays logged-out when the session probe returns 401", async () => {
    const fetchMock = vi.fn(
      async () => new Response("unauthorized", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    expect(probeRef.current!.token).toBeNull();
    expect(probeRef.current!.user).toBeNull();
    expect(probeRef.current!.loading).toBe(false);
  });

  it("survives a network error during the session probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    );
    await mount(<Probe />);
    await flushAsync();
    expect(probeRef.current!.token).toBeNull();
    expect(probeRef.current!.loading).toBe(false);
  });

  it("purges the legacy localStorage keys on boot", async () => {
    localStorage.setItem("canvhub_user_token", "legacy-token");
    localStorage.setItem(
      "canvhub_user",
      JSON.stringify({ id: "legacy", email: "old@example.com" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) as unknown as typeof fetch,
    );
    await mount(<Probe />);
    await flushAsync();
    expect(localStorage.getItem("canvhub_user_token")).toBeNull();
    expect(localStorage.getItem("canvhub_user")).toBeNull();
  });
});

describe("UserAuthProvider — googleLogin", () => {
  it("POSTs to /api/users?action=google-login and applies the returned session", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("action=session")) {
          return new Response("no session", { status: 401 });
        }
        if (url.includes("action=google-login") && init?.method === "POST") {
          const body = JSON.parse((init.body as string) || "{}");
          expect(body.action).toBe("google-login");
          expect(body.credential).toBe("fake-id-token");
          return jsonResponse({ token: "tok-google", user: mockUser });
        }
        if (url.includes("action=me")) {
          return jsonResponse({ user: mockUser, rewards: [] });
        }
        return new Response("nope", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    await act(async () => {
      await probeRef.current!.googleLogin("fake-id-token");
    });
    await flushAsync();

    expect(probeRef.current!.token).toBe("tok-google");
    expect(probeRef.current!.user).toEqual(mockUser);
  });

  it("surfaces the server error message when google-login fails", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("action=session")) {
          return new Response("no session", { status: 401 });
        }
        if (url.includes("action=google-login") && init?.method === "POST") {
          return new Response(
            JSON.stringify({ error: "Token expired, please retry" }),
            { status: 401 },
          );
        }
        return new Response("nope", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    await expect(
      act(async () => {
        await probeRef.current!.googleLogin("bad");
      }),
    ).rejects.toThrow(/Token expired/);
    expect(probeRef.current!.token).toBeNull();
  });
});

describe("UserAuthProvider — applySession + logout", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("action=session")) {
          return new Response("no session", { status: 401 });
        }
        if (url.includes("action=me")) {
          return jsonResponse({ user: mockUser, rewards: [] });
        }
        return jsonResponse({ ok: true });
      }) as unknown as typeof fetch,
    );
  });

  it("applySession() puts the provider into the signed-in state synchronously", async () => {
    await mount(<Probe />);
    await flushAsync();

    await act(async () => {
      probeRef.current!.applySession("manual-token", mockUser);
    });
    expect(probeRef.current!.token).toBe("manual-token");
    expect(probeRef.current!.user).toEqual(mockUser);
  });

  it("logout() clears in-memory state immediately and fires a server logout", async () => {
    await mount(<Probe />);
    await flushAsync();
    await act(async () => {
      probeRef.current!.applySession("manual-token", mockUser);
    });
    expect(probeRef.current!.user).not.toBeNull();

    await act(async () => {
      probeRef.current!.logout();
    });
    expect(probeRef.current!.token).toBeNull();
    expect(probeRef.current!.user).toBeNull();

    await flushAsync();
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    const logoutCall = calls.find(([, init]) => {
      const i = init as RequestInit | undefined;
      if (!i || i.method !== "POST" || !i.body) return false;
      try {
        return JSON.parse(i.body as string).action === "logout";
      } catch {
        return false;
      }
    });
    expect(logoutCall).toBeDefined();
  });

  it("logout() still clears local state when the server call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("action=session")) {
          return new Response("no session", { status: 401 });
        }
        if (init?.method === "POST") {
          throw new Error("network down");
        }
        return jsonResponse({ ok: true });
      }) as unknown as typeof fetch,
    );

    await mount(<Probe />);
    await flushAsync();
    await act(async () => {
      probeRef.current!.applySession("t", mockUser);
    });
    await act(async () => {
      probeRef.current!.logout();
    });
    expect(probeRef.current!.user).toBeNull();
  });
});

describe("UserAuthProvider — callAction surface", () => {
  it("updateProfile() POSTs the patch and applies the returned user", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("action=session")) {
          return jsonResponse({ token: "tok", user: mockUser });
        }
        if (url.includes("action=me")) {
          return jsonResponse({ user: mockUser, rewards: [] });
        }
        if (url.includes("action=update-profile") && init?.method === "POST") {
          const body = JSON.parse((init.body as string) || "{}");
          expect(body.name).toBe("Renamed");
          const updated = { ...mockUser, name: "Renamed" };
          return jsonResponse({ user: updated });
        }
        return new Response("nope", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    await act(async () => {
      await probeRef.current!.updateProfile({ name: "Renamed" });
    });
    expect(probeRef.current!.user!.name).toBe("Renamed");
  });

  it("addAddress() forwards the address payload and applies the new user record", async () => {
    const address = {
      label: "Home",
      fullName: "Test User",
      phone: "+639561234567",
      line1: "1 Main St",
      line2: "",
      city: "Caloocan",
      province: "Metro Manila",
      postalCode: "1400",
      country: "PH",
    };
    const updatedUser: PublicUser = {
      ...mockUser,
      addresses: [{ id: "addr-1", createdAt: "now", ...address }],
      defaultAddressId: "addr-1",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("action=session")) {
          return jsonResponse({ token: "tok", user: mockUser });
        }
        if (url.includes("action=me")) {
          return jsonResponse({ user: mockUser, rewards: [] });
        }
        if (url.includes("action=addresses-add") && init?.method === "POST") {
          const body = JSON.parse((init.body as string) || "{}");
          expect(body.address.label).toBe("Home");
          return jsonResponse({ user: updatedUser });
        }
        return new Response("nope", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();

    await act(async () => {
      await probeRef.current!.addAddress(address);
    });
    expect(probeRef.current!.user!.addresses).toHaveLength(1);
    expect(probeRef.current!.user!.defaultAddressId).toBe("addr-1");
  });

  it("logs the user out when callAction returns 401", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("action=session")) {
          return jsonResponse({ token: "tok", user: mockUser });
        }
        if (url.includes("action=me")) {
          return jsonResponse({ user: mockUser, rewards: [] });
        }
        if (init?.method === "POST") {
          return new Response("unauthorized", { status: 401 });
        }
        return new Response("nope", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();
    expect(probeRef.current!.user).not.toBeNull();

    await expect(
      act(async () => {
        await probeRef.current!.updateProfile({ name: "X" });
      }),
    ).rejects.toThrow(/Session expired/);
    await flushAsync();

    expect(probeRef.current!.token).toBeNull();
    expect(probeRef.current!.user).toBeNull();
  });

  it("throws when callAction is invoked without an active token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("no session", { status: 401 }),
      ) as unknown as typeof fetch,
    );
    await mount(<Probe />);
    await flushAsync();
    expect(probeRef.current!.token).toBeNull();
    await expect(
      act(async () => {
        await probeRef.current!.updateProfile({ name: "X" });
      }),
    ).rejects.toThrow(/Not signed in/);
  });
});

describe("UserAuthProvider — refresh", () => {
  it("re-fetches the user when refresh() is called", async () => {
    let meCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("action=session")) {
        return jsonResponse({ token: "tok", user: mockUser });
      }
      if (url.includes("action=me")) {
        meCount += 1;
        return jsonResponse({
          user: { ...mockUser, name: `Refreshed ${meCount}` },
          rewards: [
            {
              kind: "birthday",
              code: "BDAY",
              type: "percent",
              value: 10,
              description: "",
              expiresAt: "",
              usageLimit: 1,
              usageCount: 0,
            },
          ],
        });
      }
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();
    const initialMeCount = meCount;

    await act(async () => {
      await probeRef.current!.refresh();
    });
    expect(meCount).toBe(initialMeCount + 1);
    expect(probeRef.current!.user!.name).toMatch(/Refreshed/);
    expect(probeRef.current!.rewards).toHaveLength(1);
    expect(probeRef.current!.rewards[0].code).toBe("BDAY");
  });

  it("logs out when refresh() returns 401", async () => {
    let firstMeDone = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("action=session")) {
        return jsonResponse({ token: "tok", user: mockUser });
      }
      if (url.includes("action=me")) {
        if (!firstMeDone) {
          firstMeDone = true;
          return jsonResponse({ user: mockUser, rewards: [] });
        }
        return new Response("unauthorized", { status: 401 });
      }
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await mount(<Probe />);
    await flushAsync();
    expect(probeRef.current!.user).not.toBeNull();

    await act(async () => {
      await probeRef.current!.refresh();
    });
    expect(probeRef.current!.token).toBeNull();
    expect(probeRef.current!.user).toBeNull();
  });
});
