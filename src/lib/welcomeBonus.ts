// Tracks the visitor's "welcome bonus" countdown. Started when the
// new-user modal closes after the visitor engaged with the voucher
// (copied the code, submitted their email, or signed in). Lives in
// localStorage so the bar persists for the full 24-hour window even
// across reloads. Auto-clears once the window elapses or the cart
// successfully consumes it.

const STORAGE_KEY = "canvhub_welcome_bonus_v1";
const APPLIED_KEY = "canvhub_welcome_bonus_applied_v1";

export const WELCOME_BONUS_DURATION_MS = 24 * 60 * 60 * 1000;

export interface WelcomeBonusState {
  code: string;
  startedAt: number;
  expiresAt: number;
}

export const startWelcomeBonus = (code: string) => {
  if (typeof window === "undefined") return;
  const upper = (code || "").trim().toUpperCase();
  if (!upper) return;
  // Don't overwrite an existing live bonus — the original countdown
  // wins so we don't keep refreshing 24h every time someone re-opens
  // the modal preview.
  const existing = getWelcomeBonus();
  if (existing && existing.code === upper) return;
  const startedAt = Date.now();
  const state: WelcomeBonusState = {
    code: upper,
    startedAt,
    expiresAt: startedAt + WELCOME_BONUS_DURATION_MS,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem(APPLIED_KEY);
    window.dispatchEvent(new Event("canvhub:welcome-bonus-changed"));
  } catch {
    /* ignore */
  }
};

export const getWelcomeBonus = (): WelcomeBonusState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WelcomeBonusState>;
    if (!parsed?.code || !parsed.startedAt || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as WelcomeBonusState;
  } catch {
    return null;
  }
};

export const clearWelcomeBonus = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("canvhub:welcome-bonus-changed"));
  } catch {
    /* ignore */
  }
};

export const markWelcomeBonusApplied = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(APPLIED_KEY, "1");
  } catch {
    /* ignore */
  }
};

export const wasWelcomeBonusApplied = () => {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(APPLIED_KEY) === "1";
  } catch {
    return false;
  }
};

export const subscribeWelcomeBonus = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("canvhub:welcome-bonus-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("canvhub:welcome-bonus-changed", handler);
    window.removeEventListener("storage", handler);
  };
};
