// Static boot diagnostics. Runs from index.html *before* the SPA's
// module script so it can capture any error that happens before
// React mounts. Two failure modes are covered:
//
//   1. An uncaught error / unhandled rejection during boot.
//   2. The SPA never replacing #root within ~12 s (silent stall —
//      e.g. a syntax-error parse fail on an older Android Chrome,
//      where the module is fetched OK but never executes).
//
// When either fires we replace the boot fallback with a visible
// message that includes the captured error, a reload button, and a
// link to support so the visitor can recover and we can diagnose
// the actual cause from a screenshot.
//
// Lives in /public so it ships as a top-level `/boot-diagnostics.js`
// — an inline `<script>` in index.html would be blocked by our CSP
// (`script-src 'self'` with no `'unsafe-inline'`). Plain ES5 / no
// modules so it executes on any browser that can fetch the file at
// all.
//
// Scoped to early-boot only: once React mounts and clears
// #canvhub-boot-fallback we tear the listeners down so a later
// runtime error stays the responsibility of the in-app
// `<ErrorBoundary>` (`router.defaultErrorComponent` in `router.ts`)
// which has the styled UI + Sentry reporting hooks.
(function () {
  var bootEl = document.getElementById("canvhub-boot-fallback");
  if (!bootEl) return;
  var firstError = null;
  var shown = false;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showOverlay(reason) {
    if (shown) return;
    var stillMountingFallback = document.getElementById(
      "canvhub-boot-fallback",
    );
    // If React has already replaced #root (the fallback element is
    // gone), the app is alive and we should not paint over it.
    if (!stillMountingFallback) return;
    shown = true;
    var message =
      (firstError && (firstError.message || firstError.toString())) ||
      reason ||
      "The page could not load.";
    var detail =
      firstError && firstError.stack
        ? String(firstError.stack).slice(0, 600)
        : "";
    stillMountingFallback.innerHTML =
      '<div style="max-width: 480px; padding: 24px; text-align: center;">' +
      '<div style="font-size: 11px; letter-spacing: 0.3em;' +
      " text-transform: uppercase; opacity: 0.7; margin-bottom: 12px;" +
      '">Canvas Hub</div>' +
      '<h1 style="font-size: 20px; margin: 0 0 12px; font-weight: 500;">' +
      "We could not load the page on this device." +
      "</h1>" +
      '<p style="margin: 0 0 16px; opacity: 0.8; font-size: 14px;">' +
      "Please try reloading. If it keeps happening, screenshot the" +
      ' details below and email <a href="mailto:support@canvhub.com"' +
      ' style="color: #f5f3ee; text-decoration: underline;">' +
      "support@canvhub.com</a> so we can help." +
      "</p>" +
      '<pre style="background: rgba(245, 243, 238, 0.08);' +
      " border-radius: 6px; padding: 12px; margin: 0 0 16px;" +
      " text-align: left; font-size: 11px; line-height: 1.5;" +
      " max-height: 180px; overflow: auto; white-space: pre-wrap;" +
      ' word-break: break-word;"><strong>Error:</strong> ' +
      escapeHtml(message) +
      (detail ? "\n\n" + escapeHtml(detail) : "") +
      "\n\n<strong>UA:</strong> " +
      escapeHtml(navigator.userAgent) +
      "</pre>" +
      '<button type="button" id="canvhub-boot-reload" style="' +
      "background: #f5f3ee; color: #1c1c1c; border: none;" +
      " border-radius: 999px; padding: 10px 24px; font-size: 13px;" +
      " letter-spacing: 0.18em; text-transform: uppercase;" +
      ' cursor: pointer;">Reload</button>' +
      "</div>";
    var btn = document.getElementById("canvhub-boot-reload");
    if (btn)
      btn.addEventListener("click", function () {
        window.location.reload();
      });
  }

  function captureError(ev) {
    if (firstError) return;
    firstError =
      (ev && (ev.error || ev.reason)) ||
      (ev && ev.message ? new Error(ev.message) : new Error("boot error"));
  }

  window.addEventListener("error", captureError);
  window.addEventListener("unhandledrejection", captureError);

  // If the SPA hasn't taken over #root within 12 s, assume boot is
  // wedged. 12 s is generous enough to absorb a slow mobile network
  // pulling ~600 KB of JS while still surfacing genuine failures
  // before the visitor gives up.
  var stallTimer = window.setTimeout(function () {
    showOverlay("The app did not finish loading.");
  }, 12000);

  // Tear everything down once React has actually replaced the
  // fallback — at that point any later error belongs to the
  // in-app ErrorBoundary, not us.
  var pollMounted = window.setInterval(function () {
    if (!document.getElementById("canvhub-boot-fallback")) {
      window.clearTimeout(stallTimer);
      window.clearInterval(pollMounted);
      window.removeEventListener("error", captureError);
      window.removeEventListener("unhandledrejection", captureError);
    }
  }, 200);
})();
