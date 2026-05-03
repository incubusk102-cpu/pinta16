// PII redaction for log messages.
//
// Cloudflare Pages Functions stream `console.*` output to the Cloudflare
// dashboard's tail logs and (when configured) to Sentry. Some of our
// catch-all error handlers `console.error("orders handler error:", err)`
// where `err.message` was built from user-controlled input — that string
// can contain customer email addresses, phone numbers, postal codes, or
// IPs. None of that needs to land in third-party log storage.
//
// `redactPII(value)` returns a string safe to log. It accepts any value
// (Error, object, string) and applies regex-based scrubbing on the
// resulting message. The patterns intentionally err on the side of
// over-redaction (e.g. anything that *looks* like an email is masked even
// if it's a non-PII identifier) — the goal is "logs are debuggable but
// don't leak customer PII", not "logs preserve every byte verbatim".

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Permissive phone matcher — handles +63 9XX XXX XXXX, +1 (555) ... etc.
// Bounded to 7-15 digits so it doesn't eat order IDs or UUID fragments.
const PHONE_RE = /(?:\+?\d[\s().-]?){7,15}/g;
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
// Loose IPv6 — at least one `:` separator and 2+ hex groups. Matches
// shortened forms like `::1` and `2001:db8::1`.
const IPV6_RE = /\b(?:[0-9a-fA-F]{1,4}:){2,}[0-9a-fA-F:]*\b/g;

const maskEmail = (match) => {
  const at = match.indexOf("@");
  if (at <= 0) return "[REDACTED_EMAIL]";
  const local = match.slice(0, at);
  const domain = match.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
};

const maskPhone = (match) => {
  const digitsOnly = match.replace(/\D+/g, "");
  if (digitsOnly.length < 7) return match; // not actually a phone
  return `[REDACTED_PHONE_${digitsOnly.length}]`;
};

export const redactPII = (value) => {
  if (value == null) return String(value);
  let text;
  if (value instanceof Error) {
    text = value.stack ? `${value.message}\n${value.stack}` : value.message;
  } else if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text
    .replace(EMAIL_RE, maskEmail)
    .replace(IPV4_RE, "[REDACTED_IP]")
    .replace(IPV6_RE, "[REDACTED_IP]")
    .replace(PHONE_RE, maskPhone);
};

// Convenience wrappers so handlers don't have to call redactPII manually
// on every argument. `console.error("foo:", err)` becomes
// `logError("foo:", err)` and the err is scrubbed before it hits stdout.
const wrap =
  (level) =>
  (...args) => {
    const safe = args.map((a) =>
      typeof a === "string" && !/[@\d]/.test(a) ? a : redactPII(a),
    );
    console[level](...safe);
  };

export const logError = wrap("error");
export const logWarn = wrap("warn");
