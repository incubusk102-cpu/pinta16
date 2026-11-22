/**
 * New-user discount modal multivariate helpers.
 *
 * The modal's variant assignment is deterministic per-visitor: the same
 * browser always sees the same variant for as long as the visitor id in
 * `localStorage` (`canvhub_visitor_id`) survives. That stability matters
 * because the modal may be triggered repeatedly (time → scroll → exit
 * intent) and we never want the same visitor to see different copy on
 * different mounts.
 *
 * Schema: `NewUserModalConfig.variants` is the authoritative N-way list
 * (one entry per variant, each with its own weight + copy + voucher).
 * When `variantsEnabled === false` (the default) every visitor sees
 * `variants[0]` and the top-level `headline / body / voucherCode` still
 * read identically. The legacy `variantB` sub-tree is kept in sync on
 * the server so older readers keep working through the rollout.
 *
 * Beacons are fire-and-forget. If localStorage is blocked or the visitor
 * id hasn't been minted yet we return null/skip — the modal must still
 * render. `useVisitorHeartbeat` writes the visitor id on the very first
 * render of the SPA, so by the time the time/scroll/exit-intent timers
 * fire (default 8 s) the id is reliably present.
 */
import type {
  NewUserModalConfig,
  NewUserModalVariant,
} from "@/contexts/StorefrontConfigContext";

const VISITOR_KEY = "canvhub_visitor_id";
const VARIANT_KEY = "canvhub:newuser-modal:variant";
const ENDPOINT = "/api/newuser-modal-events";

// Same allow-list the d1 helper / public POST handler use — lowercase
// alphanumeric, underscore, hyphen; 1–32 chars. Anything else round-trips
// as variant "a" so a stale localStorage value can't smuggle a weird id
// into the beacons.
const VARIANT_ID_RE = /^[a-z0-9_-]{1,32}$/;

/**
 * The actual copy / voucher the modal should render for this visitor.
 * `variant` is the variant id ("a", "b", "c", or any admin-defined
 * slug); the rest is the resolved copy.
 */
export interface ResolvedNewUserModalCopy {
  variant: string;
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

const readPersistedVariant = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(VARIANT_KEY);
    if (typeof v !== "string") return null;
    const lower = v.toLowerCase();
    return VARIANT_ID_RE.test(lower) ? lower : null;
  } catch {
    return null;
  }
};

const persistVariant = (variant: string): void => {
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
 * 1000 to bucket the visitor. Returns 0 for empty input.
 */
const hashString = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

/**
 * Resolve the canonical list of variants for the modal, honouring both
 * the new `variants` field and the legacy top-level + `variantB` shape.
 *
 * - When `variants` has entries we use them as-is.
 * - When `variants` is missing/empty we synthesise it from the legacy
 *   top-level fields (variant A) + `variantB` (variant B) so old KV
 *   blobs keep rendering correctly.
 */
const getVariants = (modal: NewUserModalConfig): NewUserModalVariant[] => {
  const variants = Array.isArray(modal.variants) ? modal.variants : [];
  const sanitized = variants
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const id =
        typeof raw.id === "string" && VARIANT_ID_RE.test(raw.id.toLowerCase())
          ? raw.id.toLowerCase()
          : null;
      if (!id) return null;
      const weight = Math.max(
        0,
        Math.min(100, Math.floor(Number(raw.weight) || 0)),
      );
      return {
        id,
        label: typeof raw.label === "string" ? raw.label : id.toUpperCase(),
        weight,
        headline: typeof raw.headline === "string" ? raw.headline : "",
        body: typeof raw.body === "string" ? raw.body : "",
        voucherCode: typeof raw.voucherCode === "string" ? raw.voucherCode : "",
      } satisfies NewUserModalVariant;
    })
    .filter((v): v is NewUserModalVariant => v !== null);

  if (sanitized.length > 0) return sanitized;

  // Synthesise from the legacy shape.
  const legacyA: NewUserModalVariant = {
    id: "a",
    label: "Variant A",
    weight: modal.variantB?.enabled
      ? Math.max(0, 100 - Math.floor(Number(modal.variantB.weight) || 0))
      : 100,
    headline: modal.headline,
    body: modal.body,
    voucherCode: modal.voucherCode,
  };
  if (!modal.variantB?.enabled) return [legacyA];
  const legacyB: NewUserModalVariant = {
    id: "b",
    label: "Variant B",
    weight: Math.max(
      0,
      Math.min(100, Math.floor(Number(modal.variantB.weight) || 0)),
    ),
    headline: modal.variantB.headline,
    body: modal.variantB.body,
    voucherCode: modal.variantB.voucherCode || modal.voucherCode,
  };
  return [legacyA, legacyB];
};

/**
 * Pick a variant from the configured list using the visitor id as the
 * bucketing key. Pure: only reads localStorage and the passed-in config.
 * Persists the assignment so it stays stable for the lifetime of the
 * visitor id.
 *
 * Rules:
 *   - 0 variants                   → synthetic fallback (modal copy)
 *   - variantsEnabled === false    → always variants[0]
 *   - all weights 0                → always variants[0] (paused test)
 *   - exactly one variant has 100  → always that variant (admin pinned)
 *   - no visitor id yet            → always variants[0] (don't burn an
 *                                     event on a brand-new visitor)
 *   - otherwise                    → deterministic by hash(visitor_id)
 *                                     against cumulative weights
 */
export const resolveNewUserModalVariant = (
  modal: NewUserModalConfig,
): ResolvedNewUserModalCopy => {
  const variants = getVariants(modal);

  // Fallback if the variants array somehow ended up empty after
  // sanitisation. Render variant A from the legacy top-level fields so
  // the modal never goes blank.
  if (variants.length === 0) {
    return {
      variant: "a",
      headline: modal.headline,
      body: modal.body,
      voucherCode: modal.voucherCode,
    };
  }

  const head = variants[0];
  const variantsEnabled =
    modal.variantsEnabled === true ||
    // Back-compat: pre-rollout KV blobs use `variantB.enabled` to opt
    // in to a multivariate test.
    modal.variantB?.enabled === true;

  const headCopy = (v: NewUserModalVariant): ResolvedNewUserModalCopy => ({
    variant: v.id,
    headline: v.headline,
    body: v.body,
    voucherCode: v.voucherCode,
  });

  if (!variantsEnabled || variants.length < 2) return headCopy(head);

  const totalWeight = variants.reduce(
    (acc, v) => acc + Math.max(0, v.weight),
    0,
  );
  if (totalWeight <= 0) return headCopy(head);

  // Pinned: exactly one variant has weight === totalWeight (all the
  // others are 0). Skip the hash and persist the assignment.
  const nonZero = variants.filter((v) => v.weight > 0);
  if (nonZero.length === 1) {
    persistVariant(nonZero[0].id);
    return headCopy(nonZero[0]);
  }

  // Sticky: honour a previously persisted assignment if it still names
  // one of the configured variants. If the admin renamed/dropped that
  // variant we re-roll.
  const persisted = readPersistedVariant();
  if (persisted) {
    const found = variants.find((v) => v.id === persisted);
    if (found) return headCopy(found);
  }

  const sessionId = readSessionId();
  if (!sessionId) return headCopy(head);

  // Bucket against cumulative weights using a 0..999 hash so we have
  // enough granularity for traffic-splits like 1/2/97.
  const bucket = hashString(sessionId) % 1000;
  const scale = 1000 / totalWeight;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight) * scale;
    if (bucket < acc) {
      persistVariant(v.id);
      return headCopy(v);
    }
  }
  // Numerical safety net — last variant wins on the off-chance the
  // accumulator undershoots due to FP rounding.
  const tail = variants[variants.length - 1];
  persistVariant(tail.id);
  return headCopy(tail);
};

/**
 * Cheap helper for the admin preview — given a config + variant id,
 * synthesise the resolved copy without persisting anything. Returns
 * `null` if the id doesn't match any configured variant.
 */
export const previewNewUserModalVariant = (
  modal: NewUserModalConfig,
  variantId: string,
): ResolvedNewUserModalCopy | null => {
  const variants = getVariants(modal);
  const found = variants.find((v) => v.id === variantId.toLowerCase());
  if (!found) return null;
  return {
    variant: found.id,
    headline: found.headline,
    body: found.body,
    voucherCode: found.voucherCode,
  };
};

export type NewUserModalEventType = "impression" | "copy" | "submit";

/**
 * Beacon a modal A/B event. Fire-and-forget — never throws, never
 * blocks. Skips silently when there's no visitor id (e.g. localStorage
 * blocked, very first SPA mount) or when running outside a browser.
 */
export const sendNewUserModalEvent = (
  variant: string,
  eventType: NewUserModalEventType,
): void => {
  if (typeof window === "undefined") return;
  const sessionId = readSessionId();
  if (!sessionId) return;
  const safeVariant = String(variant || "").toLowerCase();
  if (!VARIANT_ID_RE.test(safeVariant)) return;

  const payload = JSON.stringify({
    sessionId,
    variant: safeVariant,
    eventType,
  });
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
 * flow so the admin can re-roll between variants without manually
 * clearing localStorage in devtools.
 */
export const resetNewUserModalVariant = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VARIANT_KEY);
  } catch {
    /* swallow */
  }
};

/**
 * Exported for the admin UI + analytics panel: the canonical variant
 * list given a config blob. Mirrors `resolveNewUserModalVariant`'s
 * synthesis rules so the admin's editor sees the same variants the
 * modal would render against.
 */
export const listNewUserModalVariants = (
  modal: NewUserModalConfig,
): NewUserModalVariant[] => getVariants(modal);
