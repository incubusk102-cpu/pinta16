// Splash screen logic — kept tiny and dependency-free so it runs as
// soon as the HTML parser sees the script tag in `index.html`.
//
// Two responsibilities:
//
//   1. Reduced-motion respect: the splash C rotation is driven by an
//      SVG <animateTransform> (SMIL) — see index.html — because CSS
//      `transform-box: view-box` + `transform-origin` does not apply
//      reliably to <g> elements on shipped Android Chrome / Brave
//      builds (the pivot collapses to viewBox 0,0 mid-paint and the
//      C swings through the lower-right quadrant instead of spinning
//      in place). SMIL ignores CSS media queries, so honouring
//      `(prefers-reduced-motion: reduce)` is done by removing the
//      <animateTransform> elements on parse — the C then renders
//      statically in its initial orientation.
//
//   2. Safety net: hide the splash after 8 s no matter what, so a
//      catastrophic main-bundle failure (network drop, blocked CDN)
//      doesn't leave the user staring at an animated C forever.
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

  // Honour OS-level reduced-motion preference. SMIL <animateTransform>
  // ignores CSS media queries, so we strip the elements directly.
  try {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      var splashEl = document.getElementById("splash");
      if (splashEl) {
        var anims = splashEl.getElementsByTagName("animateTransform");
        for (var i = anims.length - 1; i >= 0; i--) {
          if (anims[i].parentNode) {
            anims[i].parentNode.removeChild(anims[i]);
          }
        }
      }
    }
  } catch (e) {
    /* ignore — best-effort accessibility opt-out */
  }

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
