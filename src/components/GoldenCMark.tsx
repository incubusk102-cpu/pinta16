import { useId } from "react";

type Props = {
  /**
   * Square size in CSS pixels for the rendered SVG. Defaults to 32 to
   * match the original local definition in the admin sidebar.
   */
  size?: number;
  /**
   * Optional extra class name. Composed onto the base `shrink-0` (and
   * `animate-spin` when `spin` is set) so callers can layer on margin
   * / opacity / colour helpers without losing the defaults.
   */
  className?: string;
  /**
   * When true, the `<svg>` root rotates around its centre using
   * Tailwind's `animate-spin` keyframes plus `[animation-duration:6s]`
   * so the brand mark drifts at a slow, brand-friendly pace rather
   * than the spinner-default 1 s.
   *
   * Why rotate the `<svg>` root and not an inner `<g>`: SVG `<g>`
   * elements default to SVG transform semantics, which means CSS
   * `transform-origin: center` resolves against an empty bounding box
   * unless `transform-box: view-box` is also applied — and on
   * Android Chrome / Brave, shipped builds didn't honour that
   * combination on `<g>` (PRs #321/#322/#323 walked through that bug
   * for the splash mark). Rotating the `<svg>` element itself, on
   * the other hand, falls under HTML transform semantics: the
   * browser uses the element's HTML border box as the origin, so
   * `animate-spin` pivots in place on every browser without any
   * `transform-box` fiddling.
   */
  spin?: boolean;
  /**
   * Honoured when `spin` is true. Falls back to `"Loading"` so the
   * spinning C surfaces as a meaningful loading indicator to assistive
   * tech. When `spin` is false the SVG is treated as decorative
   * (`aria-hidden`) since the surrounding wordmark / page heading is
   * already labelling it.
   */
  ariaLabel?: string;
};

/**
 * Canvas Hub brand mark — italic gold-gradient "C" rendered as an
 * SVG `<text>` inside a 40×40 viewBox.
 *
 * Originally lived as a local helper inside `src/admin/AdminPage.tsx`;
 * extracted here so the storefront hero can share the same source of
 * truth and so the spinning variant stays one component away from the
 * static one (same gradient, same metrics, same alignment).
 */
export function GoldenCMark({
  size = 32,
  className = "",
  spin = false,
  ariaLabel,
}: Props) {
  // useId() ensures the `<linearGradient>` inside `<defs>` has a unique
  // identifier per component instance. Hard-coding `id="gold-grad"`
  // would collide whenever the page mounts more than one GoldenCMark
  // (e.g. admin sidebar header + sheet title), and the second instance
  // would silently re-resolve `fill="url(#gold-grad)"` to whichever
  // gradient happened to be first in document order.
  const reactId = useId();
  // useId() returns a string like ":r0:" which contains characters
  // that are valid in CSS but not in a SVG fragment identifier — strip
  // them so `url(#gold-grad-r0)` always parses cleanly.
  const gradientId = `gold-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const spinClass = spin
    ? "animate-spin [animation-duration:6s] [animation-timing-function:linear] motion-reduce:animate-none"
    : "";

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={`shrink-0 ${spinClass} ${className}`
        .trim()
        .replace(/\s+/g, " ")}
      xmlns="http://www.w3.org/2000/svg"
      role={spin ? "img" : undefined}
      aria-label={spin ? (ariaLabel ?? "Loading") : undefined}
      aria-hidden={spin ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8d48b" />
          <stop offset="50%" stopColor="#c4a86a" />
          <stop offset="100%" stopColor="#a08542" />
        </linearGradient>
      </defs>
      <text
        x="20"
        y="31"
        textAnchor="middle"
        fontFamily="'EB Garamond', Georgia, 'Playfair Display', serif"
        fontSize="34"
        fontStyle="italic"
        fontWeight={600}
        fill={`url(#${gradientId})`}
      >
        C
      </text>
    </svg>
  );
}

export default GoldenCMark;
