/* Tiny localStorage helper for the "recently viewed" strip. Stores up to
 * 16 product ids in MRU order. Does not store any product data — the
 * caller resolves ids against the live products store so prices and
 * availability stay current.
 */

const KEY = "canvhub_recently_viewed";
const MAX = 16;

const safeRead = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
};

const safeWrite = (ids: string[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    /* ignore quota / disabled storage */
  }
};

export const getRecentlyViewed = (): string[] => safeRead();

export const pushRecentlyViewed = (id: string) => {
  if (!id) return;
  const current = safeRead();
  const next = [id, ...current.filter((v) => v !== id)].slice(0, MAX);
  safeWrite(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("recently-viewed:change"));
  }
};

export const clearRecentlyViewed = () => {
  safeWrite([]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("recently-viewed:change"));
  }
};

export const subscribeRecentlyViewed = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("recently-viewed:change", handler);
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) handler();
  });
  return () => {
    window.removeEventListener("recently-viewed:change", handler);
  };
};
