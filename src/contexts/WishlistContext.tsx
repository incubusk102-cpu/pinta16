import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";

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

const WishlistContext = createContext<WishlistContextType | undefined>(
  undefined,
);

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useUserAuth();
  const storageKey = user ? userKey(user.id) : GUEST_KEY;

  const [items, setItems] = useState<WishlistEntry[]>(() =>
    readStorage(storageKey),
  );

  // When the active user changes, refresh items from storage and merge any
  // guest items into the user's saved list once they sign in.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user) {
      const guest = readStorage(GUEST_KEY);
      const existing = readStorage(userKey(user.id));
      if (guest.length > 0) {
        const byId = new Map<string, WishlistEntry>();
        for (const e of [...existing, ...guest]) byId.set(e.id, e);
        const merged = Array.from(byId.values()).sort((a, b) =>
          a.addedAt < b.addedAt ? 1 : -1,
        );
        writeStorage(userKey(user.id), merged);
        localStorage.removeItem(GUEST_KEY);
        setItems(merged);
        return;
      }
      setItems(existing);
    } else {
      setItems(readStorage(GUEST_KEY));
    }
  }, [user]);

  const persist = useCallback(
    (next: WishlistEntry[]) => {
      setItems(next);
      writeStorage(storageKey, next);
    },
    [storageKey],
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
        writeStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((e) => e.id !== id);
        writeStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
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
        writeStorage(storageKey, next);
        return next;
      });
      return added;
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

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
