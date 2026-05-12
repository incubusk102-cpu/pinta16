// Static boot diagnostics. Runs from index.html *before* the SPA's
// module script so it can capture any error that happens before
// React mounts, and exposes a small `window.__cvBoot` API that the
// SPA calls at key milestones (`main:start`, `router:created`,
// `pwa:registered`, `render:called`, `root:mounted`). When the
// stall watchdog fires we surface the *last* checkpoint reached so
// we can see exactly where boot got stuck, not just "didn't
// finish".
//
// Three failure modes are covered:
//
//   1. An uncaught error / unhandled rejection during boot.
//   2. A `vite:preloadError` for a chunk import that's never
//      recovered (Vite's `chunkReload` reloads once per session;
//      after that the same failure goes silent without this catch).
//   3. The SPA never replacing #root within ~25 s (silent stall —
//      e.g. a syntax-error parse fail on an older Android Chrome
//      where the module is fetched OK but never executes, or a
//      synchronous infinite loop in a vendor chunk).
//
// When any fires we replace the boot fallback with a visible
// message that includes the captured error / reason, the last
// checkpoint the SPA reached, a reload button, and a link to
// support. Lives in /public so it ships as a top-level
// `/boot-diagnostics.js` — an inline `<script>` in index.html
// would be blocked by our CSP (`script-src 'self'` with no
// `'unsafe-inline'`). Plain ES5 / no modules so it executes on any
// browser that can fetch the file at all.
//
// Scoped to early-boot only: once the SPA marks `root:mounted` (or
// React replaces #root, whichever comes first) we tear the
// listeners down so a later runtime error stays the responsibility
// of the in-app `<ErrorBoundary>` (`router.defaultErrorComponent`
// in `src/router.tsx`) which has the styled UI + Sentry reporting
// hooks.
(function () {
  var bootEl = document.getElementById("canvhub-boot-fallback");
  if (!bootEl) return;

  // Tunables. 25 s is generous enough to absorb a slow mobile
  // network pulling ~700 KB of JS and a slow CPU parsing it, while
  // still surfacing genuine stalls before the visitor gives up.
  var STALL_MS = 25000;

  var firstError = null;
  var preloadErrorDeps = [];
  var shown = false;
  var marks = [];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Public API for the SPA. Used to drop breadcrumbs so the
  // diagnostic overlay can show the last step reached, not just
  // "didn't finish". `mark` returns the mark name so callers can
  // chain it conveniently if they want. Safe to call before or
  // after our overlay fires; later marks are simply ignored.
  function mark(name) {
    if (typeof name !== "string" || !name) return name;
    marks.push({ name: name, t: Date.now() });
    return name;
  }

  window.__cvBoot = { mark: mark, marks: marks };

  function showOverlay(reason) {
    if (shown) return;
    var stillMountingFallback = document.getElementById(
      "canvhub-boot-fallback",
    );
    // If React has already replaced #root (the fallback element is
    // gone), the app is alive and we should not paint over it.
    if (!stillMountingFallback) return;
    shown = true;
    var errMessage =
      (firstError && (firstError.message || firstError.toString())) || "";
    var headline = errMessage || reason || "The page could not load.";
    var detail =
      firstError && firstError.stack
        ? String(firstError.stack).slice(0, 600)
        : "";
    var marksLine =
      "Last checkpoint: " +
      (marks.length
        ? marks[marks.length - 1].name +
          " (after " +
          (marks[marks.length - 1].t - marks[0].t) +
          "ms" +
          (marks.length > 1
            ? "; sequence: " +
              marks
                .map(function (m) {
                  return m.name;
                })
                .join(" -> ")
            : "") +
          ")"
        : "none (SPA module never executed)");
    var preloadLine = preloadErrorDeps.length
      ? "Chunk failures: " + preloadErrorDeps.join(", ")
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
      " max-height: 220px; overflow: auto; white-space: pre-wrap;" +
      ' word-break: break-word;"><strong>Error:</strong> ' +
      escapeHtml(headline) +
      (detail ? "\n\n" + escapeHtml(detail) : "") +
      "\n\n" +
      escapeHtml(marksLine) +
      (preloadLine ? "\n" + escapeHtml(preloadLine) : "") +
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

  function capturePreloadError(ev) {
    // Vite custom event: `event.payload` is the underlying error.
    // Capture as an error and also record the dep URL so the
    // overlay can list which chunk failed.
    var payload = ev && ev.payload;
    if (payload && !firstError) {
      firstError =
        payload instanceof Error ? payload : new Error(String(payload));
    }
    var url =
      payload &&
      typeof payload === "object" &&
      typeof payload.message === "string"
        ? payload.message
        : "";
    if (url) preloadErrorDeps.push(url);
  }

  window.addEventListener("error", captureError);
  window.addEventListener("unhandledrejection", captureError);
  window.addEventListener("vite:preloadError", capturePreloadError);

  var stallTimer = window.setTimeout(function () {
    showOverlay("The app did not finish loading.");
  }, STALL_MS);

  // Tear everything down once React has replaced the fallback (or
  // the SPA explicitly marks `root:mounted`) — at that point any
  // later error belongs to the in-app ErrorBoundary, not us.
  var pollMounted = window.setInterval(function () {
    var fallbackGone = !document.getElementById("canvhub-boot-fallback");
    var spaSignaledMount = marks.some(function (m) {
      return m.name === "root:mounted";
    });
    if (fallbackGone || spaSignaledMount) {
      window.clearTimeout(stallTimer);
      window.clearInterval(pollMounted);
      window.removeEventListener("error", captureError);
      window.removeEventListener("unhandledrejection", captureError);
      window.removeEventListener("vite:preloadError", capturePreloadError);
    }
  }, 200);
})();
