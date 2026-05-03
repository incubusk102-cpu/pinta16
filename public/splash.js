// Splash screen logic — kept tiny and dependency-free so it runs as
// soon as the HTML parser sees the script tag in `index.html`.
//
// Two responsibilities:
//
//   1. Safety net: hide the splash after 8 s no matter what, so a
//      catastrophic main-bundle failure (network drop, blocked CDN)
//      doesn't leave the user staring at an animated C forever.
//
//   2. Reduced-motion respect: SMIL <animateTransform> ignores CSS
//      `prefers-reduced-motion` queries, so we strip the animation
//      element directly when the user prefers reduced motion. Falls
//      back to a static gold C in the same final orientation.
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

  // Reduced-motion: strip the SMIL animation element.
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
    /* never let splash-tweaking break the page */
  }
})();
