// Splash screen logic — kept tiny and dependency-free so it runs as
// soon as the HTML parser sees the script tag in `index.html`.
//
// Single responsibility now:
//
//   Safety net: hide the splash after 8 s no matter what, so a
//   catastrophic main-bundle failure (network drop, blocked CDN)
//   doesn't leave the user staring at an animated C forever.
//
// Reduced-motion respect used to live here too because SMIL
// <animateTransform> ignores CSS `prefers-reduced-motion` queries.
// We migrated the rotation to a CSS animation (smoother on Android
// Chrome, GPU-composited), so reduced-motion is now handled by the
// `@media (prefers-reduced-motion: reduce)` block in /splash.css.
//
// Extracted from a previous inline <script> block so the document's
// CSP can drop `'unsafe-inline'` from `script-src` without losing
// any behaviour. Kept as a classic script (not type=module) so it
// runs synchronously while the HTML parser is still emitting the
// rest of the body — same timing as the previous inline block.

(function () {
  // Mark splash start time so other code (e.g. service worker
  // registration) can measure how long the splash was visible.
  window.__splashStart =
    (window.performance && window.performance.now()) || Date.now();

  // Safety-net auto-dismiss.
  setTimeout(function () {
    var s = document.getElementById("splash");
    if (s && !s.classList.contains("splash-hide")) {
      s.classList.add("splash-hide");
      setTimeout(function () {
        s.remove();
      }, 700);
    }
  }, 8000);
})();
