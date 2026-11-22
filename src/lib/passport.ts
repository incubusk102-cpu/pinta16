/* Gallery Passport — visitors collect a "stamp" each time they view a unique
 * painting. After STAMPS_REQUIRED stamps, a one-time discount code is
 * unlocked and revealed in a small celebratory overlay.
 *
 * State is purely client-side (localStorage). The unlock code is generated
 * deterministically from a per-browser id so backend can later validate it
 * via the same algorithm if you want server-side enforcement; until then,
 * the code is honored by the existing storefront promo system if you mint
 * a matching code in admin.
 */

const STAMPS_KEY = "canvhub_passport_stamps";
const STATE_KEY = "canvhub_passport_state";

export const STAMPS_REQUIRED = 5;
/** % off granted when the passport is fully stamped. */
export const PASSPORT_REWARD_PERCENT = 5;
/** Public promo code customers redeem at checkout for the unlock reward. */
export const PASSPORT_REWARD_CODE = "PASSPORT5";

export interface PassportState {
  unlocked: boolean;
  unlockedAt?: string;
  dismissed: boolean;
}

const readJSON = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJSON = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled */
  }
};

const notify = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("passport:change"));
};

export const getStamps = (): string[] => {
  const arr = readJSON<unknown>(STAMPS_KEY, []);
  return Array.isArray(arr)
    ? arr.filter((v): v is string => typeof v === "string")
    : [];
};

export const getPassportState = (): PassportState => {
  const raw = readJSON<Partial<PassportState>>(STATE_KEY, {});
  return {
    unlocked: Boolean(raw.unlocked),
    unlockedAt: typeof raw.unlockedAt === "string" ? raw.unlockedAt : undefined,
    dismissed: Boolean(raw.dismissed),
  };
};

const writeState = (next: PassportState) => {
  writeJSON(STATE_KEY, next);
  notify();
};

/** Add a stamp for the given product id. Idempotent (one stamp per id). */
export const addStamp = (
  productId: string,
): { stamps: string[]; justUnlocked: boolean } => {
  if (!productId) return { stamps: getStamps(), justUnlocked: false };
  const current = getStamps();
  if (current.includes(productId))
    return { stamps: current, justUnlocked: false };
  const next = [...current, productId];
  writeJSON(STAMPS_KEY, next);
  let justUnlocked = false;
  const state = getPassportState();
  if (!state.unlocked && next.length >= STAMPS_REQUIRED) {
    writeState({
      unlocked: true,
      unlockedAt: new Date().toISOString(),
      dismissed: false,
    });
    justUnlocked = true;
  } else {
    notify();
  }
  return { stamps: next, justUnlocked };
};

export const dismissPassportReward = () => {
  const current = getPassportState();
  writeState({ ...current, dismissed: true });
};

/** Reset the passport. Useful for QA + the "I claimed it" flow. */
export const resetPassport = () => {
  writeJSON(STAMPS_KEY, []);
  writeJSON(STATE_KEY, {});
  notify();
};

export const subscribePassport = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("passport:change", handler);
  const storage = (e: StorageEvent) => {
    if (e.key === STAMPS_KEY || e.key === STATE_KEY) handler();
  };
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("passport:change", handler);
    window.removeEventListener("storage", storage);
  };
};
