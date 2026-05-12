import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Lightweight side-by-side compare list. Visitors can mark up to
 * `COMPARE_LIMIT` artworks while browsing the gallery; the
 * `CompareDrawer` (mounted at the root) renders the picks as a
 * bottom sheet that lets them eyeball price / medium / availability
 * at a glance without bouncing between product pages.
 *
 * State persists in localStorage with a versioned key so future
 * schema changes can be rolled out without breaking older clients —
 * see the WishlistContext for the same pattern.
 */

export interface CompareEntry {
  id: string;
  title: string;
  image: string;
  medium?: string;
  year?: string;
  price: number;
  salePrice?: number;
  /** Tag we surface in the drawer (e.g. "Sold", "Made to order"). */
  availability?: string;
  /** ISO timestamp — kept so newest pick floats to the right. */
  addedAt: string;
}

export const COMPARE_LIMIT = 4;
const STORAGE_KEY = "canvhub_compare_v1";

interface CompareContextValue {
  items: CompareEntry[];
  ids: Set<string>;
  isOpen: boolean;
  has: (id: string) => boolean;
  toggle: (entry: Omit<CompareEntry, "addedAt">) => {
    added: boolean;
    rejected: boolean;
  };
  remove: (id: string) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
  count: number;
  limit: number;
}

const CompareContext = createContext<CompareContextValue | undefined>(
  undefined,
);

const readStorage = (): CompareEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompareEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.title === "string" &&
          typeof e.image === "string" &&
          typeof e.price === "number" &&
          typeof e.addedAt === "string",
      )
      .slice(0, COMPARE_LIMIT);
  } catch {
    return [];
  }
};

const writeStorage = (items: CompareEntry[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Out of quota — drop the cache, the in-memory state still works.
  }
};

export const CompareProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CompareEntry[]>(() => readStorage());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    writeStorage(items);
  }, [items]);

  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const has = useCallback((id: string) => ids.has(id), [ids]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const toggle = useCallback((entry: Omit<CompareEntry, "addedAt">) => {
    let result: { added: boolean; rejected: boolean } = {
      added: false,
      rejected: false,
    };
    setItems((prev) => {
      const existing = prev.find((e) => e.id === entry.id);
      if (existing) {
        result = { added: false, rejected: false };
        return prev.filter((e) => e.id !== entry.id);
      }
      if (prev.length >= COMPARE_LIMIT) {
        result = { added: false, rejected: true };
        return prev;
      }
      result = { added: true, rejected: false };
      return [...prev, { ...entry, addedAt: new Date().toISOString() }];
    });
    return result;
  }, []);

  // Auto-close the drawer the moment the list empties so it doesn't
  // hover over the page with an empty body while the visitor browses.
  useEffect(() => {
    if (items.length === 0 && isOpen) setIsOpen(false);
  }, [items.length, isOpen]);

  const value = useMemo<CompareContextValue>(
    () => ({
      items,
      ids,
      isOpen,
      has,
      toggle,
      remove,
      clear,
      open,
      close,
      count: items.length,
      limit: COMPARE_LIMIT,
    }),
    [items, ids, isOpen, has, toggle, remove, clear, open, close],
  );

  return (
    <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
  );
};

export const useCompare = (): CompareContextValue => {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error("useCompare must be used within a CompareProvider");
  }
  return ctx;
};
