/* Welcome-back tracker — records the visitor's most recent visit timestamp
 * and lets callers decide whether to show a "welcome back" toast on the
 * next visit (typically after >= 12 hours away).
 */

const KEY = "canvhub_last_visit";
const RETURN_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export const getLastVisit = (): number => {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

export const markVisit = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};

export const isReturningVisitor = (): boolean => {
  const last = getLastVisit();
  if (!last) return false;
  return Date.now() - last >= RETURN_THRESHOLD_MS;
};
