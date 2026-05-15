// Customer segmentation rules — shared by `functions/api/customers.js`
// and `functions/api/_lib/broadcasts.js` so the admin Customers panel and
// the broadcast audience picker classify customers the same way.
//
// Why this exists: the segmentation thresholds (VIP ≥ ₱10k LTV, repeat
// 2+ orders, at-risk 60+ days) used to be three hardcoded constants
// duplicated across customers.js and broadcasts.js. This module lets
// admins customise the 5 default buckets — adjust thresholds, rename,
// recolour, add new buckets, or reorder priority — without redeploying.
//
// Storage:
//   KV namespace `customer-meta`, key `segment-rules`. Value shape:
//
//     {
//       version: 1,
//       updatedAt: "<ISO>",
//       segments: [
//         {
//           id: "vip",            // lowercase slug, unique
//           label: "VIP",         // human label, 1..40 chars
//           color: "amber",       // one of SEGMENT_COLORS
//           priority: 100,        // higher = matched first
//           conditions: [         // ALL must match (AND); empty = catch-all
//             { field: "netSpend", op: "gte", value: 10000 }
//           ]
//         },
//         …
//       ]
//     }
//
// When the key is missing or malformed we return DEFAULT_SEGMENTS, which
// reproduces the original five hardcoded buckets exactly.

import { getStore } from "./kv-stores.js";

const META_STORE = "customer-meta";
const RULES_KEY = "segment-rules";

const SEGMENT_FIELDS = [
  "netSpend",
  "grossSpend",
  "ordersCount",
  "daysSinceOrder",
  "registered",
];

const NUMERIC_OPS = ["gte", "gt", "lte", "lt", "eq", "neq"];
const BOOLEAN_OPS = ["eq", "neq"];

const SEGMENT_COLORS = [
  "amber",
  "emerald",
  "sky",
  "rose",
  "violet",
  "fuchsia",
  "teal",
  "muted",
];

const MAX_SEGMENTS = 20;
const MAX_CONDITIONS_PER_SEGMENT = 6;
const ID_RE = /^[a-z][a-z0-9_]{0,31}$/;

const DEFAULT_SEGMENTS = [
  {
    id: "vip",
    label: "VIP",
    color: "amber",
    priority: 100,
    conditions: [{ field: "netSpend", op: "gte", value: 10000 }],
  },
  {
    id: "at_risk",
    label: "At-risk",
    color: "rose",
    priority: 80,
    conditions: [
      { field: "ordersCount", op: "gte", value: 1 },
      { field: "daysSinceOrder", op: "gt", value: 60 },
    ],
  },
  {
    id: "repeat",
    label: "Repeat",
    color: "emerald",
    priority: 60,
    conditions: [{ field: "ordersCount", op: "gte", value: 2 }],
  },
  {
    id: "one_time",
    label: "One-time",
    color: "sky",
    priority: 40,
    conditions: [{ field: "ordersCount", op: "eq", value: 1 }],
  },
  {
    id: "lead",
    label: "Lead",
    color: "muted",
    priority: 20,
    conditions: [],
  },
];

const FALLBACK_SEGMENT_ID = "unsegmented";

const cloneDefaults = () =>
  DEFAULT_SEGMENTS.map((s) => ({
    ...s,
    conditions: s.conditions.map((c) => ({ ...c })),
  }));

const isFiniteNumber = (n) => typeof n === "number" && Number.isFinite(n);

const compareNumeric = (op, lhs, rhs) => {
  // `null` lhs (e.g. daysSinceOrder for never-ordered customers) only
  // matches `eq null` / `neq <value>` semantics — comparisons against a
  // numeric `value` always fall through as false. This preserves the
  // original behaviour where the at-risk rule never triggered on
  // never-ordered customers.
  if (lhs === null || lhs === undefined) return false;
  if (!isFiniteNumber(lhs) || !isFiniteNumber(rhs)) return false;
  switch (op) {
    case "gte":
      return lhs >= rhs;
    case "gt":
      return lhs > rhs;
    case "lte":
      return lhs <= rhs;
    case "lt":
      return lhs < rhs;
    case "eq":
      return lhs === rhs;
    case "neq":
      return lhs !== rhs;
    default:
      return false;
  }
};

const compareBoolean = (op, lhs, rhs) => {
  const lb = Boolean(lhs);
  const rb = Boolean(rhs);
  if (op === "eq") return lb === rb;
  if (op === "neq") return lb !== rb;
  return false;
};

const evaluateCondition = (condition, customer) => {
  if (!condition || typeof condition !== "object") return false;
  const { field, op, value } = condition;
  if (!SEGMENT_FIELDS.includes(field)) return false;
  if (field === "registered") {
    if (!BOOLEAN_OPS.includes(op)) return false;
    return compareBoolean(op, customer.registered, value);
  }
  if (!NUMERIC_OPS.includes(op)) return false;
  const lhs = customer[field];
  return compareNumeric(op, lhs ?? null, Number(value));
};

const matchesSegment = (segment, customer) => {
  if (!Array.isArray(segment.conditions)) return false;
  if (segment.conditions.length === 0) return true; // catch-all
  return segment.conditions.every((cond) => evaluateCondition(cond, customer));
};

// classifySegment returns the id of the first segment (highest priority,
// stable order for ties) whose conditions all match the customer
// aggregate, or FALLBACK_SEGMENT_ID when nothing matches.
export const classifySegment = (customer, segments) => {
  const list = sortByPriority(
    Array.isArray(segments) && segments.length > 0
      ? segments
      : DEFAULT_SEGMENTS,
  );
  for (const segment of list) {
    if (matchesSegment(segment, customer)) return segment.id;
  }
  return FALLBACK_SEGMENT_ID;
};

const sortByPriority = (segments) =>
  [...segments].sort((a, b) => {
    const pa = Number(a.priority);
    const pb = Number(b.priority);
    const na = Number.isFinite(pa) ? pa : 0;
    const nb = Number.isFinite(pb) ? pb : 0;
    if (na !== nb) return nb - na;
    // Stable secondary sort: original index already preserved by [...spread]
    return 0;
  });

const sanitizeCondition = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const field = String(raw.field || "");
  if (!SEGMENT_FIELDS.includes(field)) return null;
  const op = String(raw.op || "");
  if (field === "registered") {
    if (!BOOLEAN_OPS.includes(op)) return null;
    return { field, op, value: Boolean(raw.value) };
  }
  if (!NUMERIC_OPS.includes(op)) return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value)) return null;
  return { field, op, value };
};

const sanitizeSegment = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "")
    .trim()
    .toLowerCase();
  if (!ID_RE.test(id)) return null;
  const label = String(raw.label || "")
    .trim()
    .slice(0, 40);
  if (!label) return null;
  const color = SEGMENT_COLORS.includes(raw.color) ? raw.color : "muted";
  const priorityRaw = Number(raw.priority);
  const priority = Number.isFinite(priorityRaw)
    ? Math.max(0, Math.min(1000, Math.round(priorityRaw)))
    : 0;
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions
        .slice(0, MAX_CONDITIONS_PER_SEGMENT)
        .map((c) => sanitizeCondition(c))
        .filter((c) => c !== null)
    : [];
  return { id, label, color, priority, conditions };
};

// sanitizeSegments enforces the persisted shape: returns a deduped,
// trimmed list of valid segments. Throws when the result would be
// empty so we never persist an unusable config.
export const sanitizeSegments = (rawList) => {
  if (!Array.isArray(rawList)) {
    throw new Error("segments must be an array");
  }
  const sanitized = [];
  const seen = new Set();
  for (const raw of rawList.slice(0, MAX_SEGMENTS)) {
    const seg = sanitizeSegment(raw);
    if (!seg) continue;
    if (seen.has(seg.id)) continue;
    seen.add(seg.id);
    sanitized.push(seg);
  }
  if (sanitized.length === 0) {
    throw new Error("at least one valid segment is required");
  }
  return sanitized;
};

// readSegmentRules returns the persisted rule set, or DEFAULT_SEGMENTS
// when the key is missing / malformed / KV is unavailable. Never throws.
export const readSegmentRules = async () => {
  try {
    const store = getStore(META_STORE);
    const v = await store.get(RULES_KEY, { type: "json" });
    if (!v || typeof v !== "object" || !Array.isArray(v.segments)) {
      return { segments: cloneDefaults(), updatedAt: "", isDefault: true };
    }
    const segments = sanitizeSegments(v.segments);
    return {
      segments,
      updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
      isDefault: false,
    };
  } catch {
    return { segments: cloneDefaults(), updatedAt: "", isDefault: true };
  }
};

export const writeSegmentRules = async (rawList) => {
  const segments = sanitizeSegments(rawList);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    segments,
  };
  const store = getStore(META_STORE);
  await store.setJSON(RULES_KEY, payload);
  return payload;
};

export const resetSegmentRules = async () => {
  const store = getStore(META_STORE);
  await store.delete(RULES_KEY);
  return { segments: cloneDefaults(), updatedAt: "", isDefault: true };
};

export const getDefaultSegments = () => cloneDefaults();

export const SEGMENT_CONSTANTS = Object.freeze({
  FIELDS: SEGMENT_FIELDS,
  NUMERIC_OPS,
  BOOLEAN_OPS,
  COLORS: SEGMENT_COLORS,
  MAX_SEGMENTS,
  MAX_CONDITIONS_PER_SEGMENT,
  FALLBACK_SEGMENT_ID,
});
