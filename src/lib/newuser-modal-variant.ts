/**
 * New-user discount modal A/B helpers.
 *
 * The modal's variant assignment is deterministic per-visitor: the same
 * browser always sees the same variant for as long as the visitor id in
 * `localStorage` (`canvhub_visitor_id`) survives. That stability matters
 * because the modal may be triggered repeatedly (time → scroll → exit
 * intent) and we never want the same visitor to see different copy on
 * different mounts.
 *
 * Beacons are fire-and-forget. If localStorage is blocked or the visitor
 * id hasn't been minted yet we return null/skip — the modal must still
 * render. `useVisitorHeartbeat` writes the visitor id on the very first
 * render of the SPA, so by the time the time/scroll/exit-intent timers
 * fire (default 8 s) the id is reliably present.
 */
import type { NewUserModalConfig } from "@/contexts/StorefrontConfigContext";

const VISITOR_KEY = "canvhub_visitor_id";
const VARIANT_KEY = "canvhub:newuser-modal:variant";
const ENDPOINT = "/api/newuser-modal-events";

export type NewUserModalVariant = "a" | "b";

/**
 * The actual copy / voucher the modal should render for this visitor.
 * Variant A is always the top-level fields on `NewUserModalConfig`;
 * variant B is the `variantB` sub-tree when enabled.
 */
export interface ResolvedNewUserModalCopy {
  variant: NewUserModalVariant;
  headline: string;
  body: string;
  voucherCode: string;
}

const readSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VISITOR_KEY);
  } catch {
    return null;
  }
};

const readPersistedVariant = (): NewUserModalVariant | null => {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(VARIANT_KEY);
    return v === "a" || v === "b" ? v : null;
  } catch {
    return null;
  }
};

const persistVariant = (variant: NewUserModalVariant): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VARIANT_KEY, variant);
  } catch {
    /* localStorage blocked — variant will be re-derived next mount */
  }
};

/**
 * Stable, fast 32-bit string hash (djb2 variant). We don't need a
 * cryptographic hash — just a uniform integer in [0, 2^31) we can mod by
 * 100 to bucket the visitor. Returns 0 for empty input.
 */
const hashString = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

/**
 * Decide which variant a visitor should see. Pure: only reads from
 * localStorage and the passed-in config. Persists the assignment so the
 * variant is sticky for the lifetime of the visitor id.
 *
 * Rules:
 *   - variantB disabled            → always "a"
 *   - variantB.weight === 0        → always "a" (admin paused the test)
 *   - variantB.weight === 100      → always "b" (admin promoted B)
 *   - no visitor id yet            → always "a" (don't burn an event on
 *                                     a brand-new visitor before the id
 *                                     is written to localStorage)
 *   - otherwise                    → deterministic by hash(visitor_id)
 *                                     so the assignment is stable
 */
export const resolveNewUserModalVariant = (
  modal: NewUserModalConfig,
): ResolvedNewUserModalCopy => {
  const variantA: ResolvedNewUserModalCopy = {
    variant: "a",
    headline: modal.headline,
    body: modal.body,
    voucherCode: modal.voucherCode,
  };

  const vb = modal.variantB;
  if (!vb || !vb.enabled) return variantA;

  const weight = Math.min(100, Math.max(0, Math.floor(vb.weight)));
  if (weight === 0) return variantA;

  const variantB: ResolvedNewUserModalCopy = {
    variant: "b",
    headline: vb.headline,
    body: vb.body,
    voucherCode: vb.voucherCode,
  };
  if (weight === 100) {
    persistVariant("b");
    return variantB;
  }

  const persisted = readPersistedVariant();
  if (persisted) {
    return persisted === "b" ? variantB : variantA;
  }

  const sessionId = readSessionId();
  if (!sessionId) return variantA;

  const bucket = hashString(sessionId) % 100;
  const variant: NewUserModalVariant = bucket < weight ? "b" : "a";
  persistVariant(variant);
  return variant === "b" ? variantB : variantA;
};

export type NewUserModalEventType = "impression" | "copy" | "submit";

/**
 * Beacon a modal A/B event. Fire-and-forget — never throws, never
 * blocks. Skips silently when there's no visitor id (e.g. localStorage
 * blocked, very first SPA mount) or when running outside a browser.
 */
export const sendNewUserModalEvent = (
  variant: NewUserModalVariant,
  eventType: NewUserModalEventType,
): void => {
  if (typeof window === "undefined") return;
  const sessionId = readSessionId();
  if (!sessionId) return;

  const payload = JSON.stringify({ sessionId, variant, eventType });
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    /* swallow */
  }
};

/**
 * Clear the persisted variant assignment. Useful for the admin preview
 * flow so the admin can re-roll between A and B without manually clearing
 * localStorage in devtools.
 */
export const resetNewUserModalVariant = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VARIANT_KEY);
  } catch {
    /* swallow */
  }
};
