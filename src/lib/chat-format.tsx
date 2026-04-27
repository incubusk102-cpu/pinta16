import { Fragment, type ReactNode } from "react";

// Lightweight URL / email linkifier for chat messages. Returns an array of
// React nodes so we don't have to set dangerous innerHTML. Only http(s) and
// mailto schemes are emitted; anything that doesn't match is rendered as
// plain text.
const URL_RE = /\b(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/gi;
const EMAIL_RE = /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;

export const linkifyMessage = (body: string): ReactNode => {
  if (!body) return body;
  // Split on URLs first, then on emails inside each non-URL chunk. Using a
  // single regex with alternation is tempting but makes matched-group
  // dispatch awkward — two passes keep the code simple and correct.
  const urlParts = body.split(URL_RE);
  return urlParts.map((part, i) => {
    if (i % 2 === 1) {
      // URL capture group
      return (
        <a
          key={`u-${i}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all text-inherit hover:opacity-80"
        >
          {part}
        </a>
      );
    }
    // Non-URL chunk — look for emails inside.
    const emailSegments: ReactNode[] = [];
    let lastIndex = 0;
    const matches = part.matchAll(EMAIL_RE);
    for (const match of matches) {
      const start = match.index ?? 0;
      if (start > lastIndex) {
        emailSegments.push(
          <Fragment key={`t-${i}-${lastIndex}`}>
            {part.slice(lastIndex, start)}
          </Fragment>,
        );
      }
      const addr = match[0];
      emailSegments.push(
        <a
          key={`e-${i}-${start}`}
          href={`mailto:${addr}`}
          className="underline break-all text-inherit hover:opacity-80"
        >
          {addr}
        </a>,
      );
      lastIndex = start + addr.length;
    }
    if (lastIndex < part.length) {
      emailSegments.push(
        <Fragment key={`t-${i}-${lastIndex}-end`}>
          {part.slice(lastIndex)}
        </Fragment>,
      );
    }
    return (
      <Fragment key={`s-${i}`}>
        {emailSegments.length > 0 ? emailSegments : part}
      </Fragment>
    );
  });
};

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

export const formatRelativeTime = (iso: string, now = Date.now()): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = now - t;
  if (diff < 0) return "just now";
  if (diff < 45 * 1000) return "just now";
  if (diff < MIN) return "a few seconds ago";
  // Floor so that e.g. 59m 30s stays "59m ago" instead of rounding up to
  // "60m ago" and escaping the strict `< HR` guard on the next branch.
  if (diff < HR) {
    const m = Math.floor(diff / MIN);
    return `${m}m ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HR);
    return `${h}h ago`;
  }
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return `${d}d ago`;
  }
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

export const formatAbsoluteTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};
