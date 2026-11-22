import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { jsonAuthHeaders } from "@/lib/api";

export interface WishlistEntry {
  id: string;
  title?: string;
  image?: string;
  price?: number;
  addedAt: string;
}

interface WishlistContextType {
  items: WishlistEntry[];
  ids: Set<string>;
  has: (id: string) => boolean;
  toggle: (entry: Omit<WishlistEntry, "addedAt">) => boolean;
  add: (entry: Omit<WishlistEntry, "addedAt">) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
}

const GUEST_KEY = "canvhub_wishlist_guest";
const userKey = (userId: string) => `canvhub_wishlist_user_${userId}`;

const readStorage = (key: string): WishlistEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WishlistEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.id === "string" && typeof e.addedAt === "string",
    );
  } catch {
    return [];
  }
};

const writeStorage = (key: string, items: WishlistEntry[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
};

// Merge two or more wishlist arrays, deduping by id and keeping the newest
// addedAt. Newest entries float to the top so the UI matches the
// localStorage insert order.
const mergeWishlists = (...lists: WishlistEntry[][]): WishlistEntry[] => {
  const byId = new Map<string, WishlistEntry>();
  for (const list of lists) {
    for (const entry of list) {
      if (!entry || typeof entry.id !== "string") continue;
      const existing = byId.get(entry.id);
      if (!existing || existing.addedAt < entry.addedAt) {
        byId.set(entry.id, entry);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.addedAt < b.addedAt ? 1 : -1,
  );
};

// ─── Server sync ─────────────────────────────────────────────────────────────
// Every helper is null-safe: when /api/wishlist returns 503 (binding not
// configured), throws on network error, or 401s (cookie expired between
// renders), the SPA quietly falls back to localStorage exactly as before.

type SyncStatus = "ok" | "unconfigured" | "unauthenticated" | "error";

interface SyncResult {
  status: SyncStatus;
  items?: WishlistEntry[];
}

const fetchServerWishlist = async (): Promise<SyncResult> => {
  try {
    const res = await fetch("/api/wishlist", { credentials: "include" });
    if (res.status === 503) return { status: "unconfigured" };
    if (res.status === 401) return { status: "unauthenticated" };
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as { items?: WishlistEntry[] };
    return {
      status: "ok",
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch {
    return { status: "error" };
  }
};

const replaceServerWishlist = async (
  items: WishlistEntry[],
): Promise<SyncResult> => {
  try {
    const res = await fetch("/api/wishlist", {
      method: "PUT",
      credentials: "include",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ items }),
    });
    if (res.status === 503) return { status: "unconfigured" };
    if (res.status === 401) return { status: "unauthenticated" };
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as { items?: WishlistEntry[] };
    return {
      status: "ok",
      items: Array.isArray(data.items) ? data.items : items,
    };
  } catch {
    return { status: "error" };
  }
};

const WishlistContext = createContext<WishlistContextType | undefined>(
  undefined,
);

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useUserAuth();
  const storageKey = user ? userKey(user.id) : GUEST_KEY;

  const [items, setItems] = useState<WishlistEntry[]>(() =>
    readStorage(storageKey),
  );

  // Tracks whether the server endpoint is reachable for the *current*
  // signed-in user. Once we've seen a 503 (binding not configured) we stop
  // firing follow-up writes for the rest of the session — saves a request
  // per click during operator setup, and matches the silent-fallback
  // contract advertised in `wrangler.toml`.
  const serverEnabledRef = useRef(true);

  // Re-enable server sync whenever the active user changes so a sign-in
  // event after a guest browse session re-probes the endpoint.
  useEffect(() => {
    serverEnabledRef.current = true;
  }, [user?.id]);

  // When the active user changes, refresh items from storage, merge any
  // guest items into the user's saved list, then (best-effort) reconcile
  // with the server-side wishlist. Server sync is purely additive — if it
  // fails for any reason the localStorage path keeps working.
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!user) {
      setItems(readStorage(GUEST_KEY));
      return;
    }

    const guest = readStorage(GUEST_KEY);
    const localUser = readStorage(userKey(user.id));
    const localMerged = mergeWishlists(localUser, guest);
    if (guest.length > 0) {
      writeStorage(userKey(user.id), localMerged);
      localStorage.removeItem(GUEST_KEY);
    }
    setItems(localMerged);

    let cancelled = false;
    void (async () => {
      const fetched = await fetchServerWishlist();
      if (cancelled) return;

      if (fetched.status === "unconfigured") {
        serverEnabledRef.current = false;
        return;
      }
      if (fetched.status !== "ok" || !fetched.items) {
        // Network blip / 5xx — keep what we have locally and let the next
        // mutation reattempt the write.
        return;
      }

      const merged = mergeWishlists(localMerged, fetched.items);
      // Only push back if local additions actually broaden the server's
      // list — saves a redundant PUT round-trip on every navigation.
      const needsPush = merged.length !== fetched.items.length;
      if (needsPush) {
        const pushed = await replaceServerWishlist(merged);
        if (cancelled) return;
        if (pushed.status === "unconfigured") {
          serverEnabledRef.current = false;
        }
      }
      writeStorage(userKey(user.id), merged);
      setItems(merged);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const persistLocal = useCallback(
    (next: WishlistEntry[]) => {
      writeStorage(storageKey, next);
    },
    [storageKey],
  );

  // Fire-and-forget server replacement after every mutation. Only runs
  // when a user is signed in AND we haven't given up on the endpoint
  // (503-not-configured case).
  const pushServer = useCallback(
    (next: WishlistEntry[]) => {
      if (!user) return;
      if (!serverEnabledRef.current) return;
      void replaceServerWishlist(next).then((result) => {
        if (result.status === "unconfigured") {
          serverEnabledRef.current = false;
        }
      });
    },
    [user],
  );

  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const has = useCallback((id: string) => ids.has(id), [ids]);

  const add = useCallback(
    (entry: Omit<WishlistEntry, "addedAt">) => {
      setItems((prev) => {
        if (prev.some((e) => e.id === entry.id)) return prev;
        const next: WishlistEntry[] = [
          { ...entry, addedAt: new Date().toISOString() },
          ...prev,
        ];
        persistLocal(next);
        pushServer(next);
        return next;
      });
    },
    [persistLocal, pushServer],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((e) => e.id !== id);
        persistLocal(next);
        pushServer(next);
        return next;
      });
    },
    [persistLocal, pushServer],
  );

  const toggle = useCallback(
    (entry: Omit<WishlistEntry, "addedAt">) => {
      let added = false;
      setItems((prev) => {
        const exists = prev.some((e) => e.id === entry.id);
        const next = exists
          ? prev.filter((e) => e.id !== entry.id)
          : [{ ...entry, addedAt: new Date().toISOString() }, ...prev];
        added = !exists;
        persistLocal(next);
        pushServer(next);
        return next;
      });
      return added;
    },
    [persistLocal, pushServer],
  );

  const clear = useCallback(() => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      const next: WishlistEntry[] = [];
      persistLocal(next);
      pushServer(next);
      return next;
    });
  }, [persistLocal, pushServer]);

  const value: WishlistContextType = {
    items,
    ids,
    has,
    toggle,
    add,
    remove,
    clear,
    count: items.length,
  };

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
};
