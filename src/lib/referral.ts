// Captures a friend's referral code from `?ref=CODE` query params and
// stores it for the duration of the visitor's session. When the visitor
// signs up (Google OAuth or email), the stored code is sent along so the
// backend can credit both inviter and invitee on first paid order.

const STORAGE_KEY = "canvhub_referral_code_v1";

const isValidShape = (raw: string): boolean =>
  /^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}$/i.test(raw);

export const captureReferralFromUrl = (): void => {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (!ref) return;
    const trimmed = ref.trim();
    if (!isValidShape(trimmed)) return;
    localStorage.setItem(STORAGE_KEY, trimmed.toUpperCase());
  } catch {
    /* swallow */
  }
};

export const readStoredReferral = (): string => {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

export const clearStoredReferral = (): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* swallow */
  }
};

export const buildReferralLink = (code: string): string => {
  if (typeof window === "undefined") return `?ref=${code}`;
  const base = `${window.location.origin}/`;
  return `${base}?ref=${encodeURIComponent(code)}`;
};
