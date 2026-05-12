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
// Auto-recovery: before painting the visible overlay we try to
// silently self-heal the most common stuck-bundle root cause —
// a poisoned service-worker cache pinning a broken / outdated
// chunk. The first time boot fails we wipe `caches.keys()`,
// unregister every service-worker registration on this origin,
// and reload the page with a cache-bust query param so the next
// boot pulls a clean bundle tree directly from origin. The attempt
// counter lives in `sessionStorage` so it survives the reload but
// resets when the visitor opens a new tab / closes the browser,
// preventing a refresh loop. We cap silent retries at
// `RECOVERY_MAX_ATTEMPTS` and only paint the visible overlay once
// auto-recovery itself fails that many times in a row — at which
// point the visitor sees the manual "Reset & reload" button and
// the last checkpoint reached. The counter clears on a successful
// mount so a future boot failure starts from zero.
//
// When the overlay does fire we replace the boot fallback with a
// visible message that includes the captured error / reason, the
// last checkpoint the SPA reached, a reload button, and a link to
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
  // How long to wait after an asset / preload / module error before
  // attempting silent auto-recovery. Gives Vite's built-in
  // `chunkReload` (one-shot per session) a chance to recover the
  // failed import on its own before we nuke the whole SW + cache.
  var ASSET_ERROR_RECOVERY_DELAY_MS = 4000;
  // Hard cap on silent recoveries before the visible overlay takes
  // over. Counter lives in `sessionStorage` (RECOVERY_KEY) and
  // survives the auto-reload but resets when the SPA finally
  // mounts. "2" means: first stuck boot → silent recovery #1;
  // still stuck after that → silent recovery #2; still stuck after
  // *that* → visible overlay so the visitor can take action.
  var RECOVERY_MAX_ATTEMPTS = 2;
  var RECOVERY_KEY = "canvhub_boot_recovery_v1";

  var firstError = null;
  var preloadErrorDeps = [];
  var moduleErrors = [];
  var shown = false;
  var recovering = false;
  var assetErrorRecoveryScheduled = false;
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

  // Persisted (per-tab) attempt counter for the silent auto-recovery
  // path. sessionStorage is the right scope: survives the reload
  // we trigger but clears when the visitor closes the tab / opens
  // a fresh window, so a permanently broken environment can't
  // hide the overlay forever. All helpers are best-effort —
  // Safari Private Browsing throws on `setItem`, in which case we
  // treat the counter as 0 and the auto-recovery never escalates
  // past attempt #1 (still better than no recovery at all).
  function readRecoveryAttempts() {
    try {
      var raw = window.sessionStorage.getItem(RECOVERY_KEY);
      if (!raw) return 0;
      var n = parseInt(raw, 10);
      return isNaN(n) || n < 0 ? 0 : n;
    } catch (e) {
      return 0;
    }
  }

  function writeRecoveryAttempts(n) {
    try {
      window.sessionStorage.setItem(RECOVERY_KEY, String(n));
    } catch (e) {
      /* ignore */
    }
  }

  function clearRecoveryAttempts() {
    try {
      window.sessionStorage.removeItem(RECOVERY_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  // Silent self-heal: wipe `caches.*` + unregister every SW on
  // this origin, then reload with a cache-bust query param. Used
  // when boot is stuck before the SPA has had a chance to render
  // anything, so we recover without ever showing the user the
  // overlay. Returns true if a recovery attempt was actually
  // started (caller should NOT also call showOverlay in that
  // case); returns false if we've already exhausted the attempt
  // budget and the caller should fall through to showOverlay.
  function tryAutoRecover(reason) {
    if (recovering || shown) return true;
    var fallbackEl = document.getElementById("canvhub-boot-fallback");
    // If React has already replaced #root, the SPA is alive — do
    // nothing.
    if (!fallbackEl) return true;
    var attempts = readRecoveryAttempts();
    if (attempts >= RECOVERY_MAX_ATTEMPTS) return false;
    recovering = true;
    writeRecoveryAttempts(attempts + 1);
    resetAndReload({ silent: true, reason: reason || "auto-recover" });
    return true;
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
    var recoveryAttempts = readRecoveryAttempts();
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
    var moduleLine = moduleErrors.length
      ? "Module load failures: " + moduleErrors.join("; ")
      : "";
    var recoveryLine = recoveryAttempts
      ? "Auto-recovery attempts: " +
        recoveryAttempts +
        "/" +
        RECOVERY_MAX_ATTEMPTS +
        " (silent cache + SW reset already retried; falling back to manual reset)"
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
      (moduleLine ? "\n" + escapeHtml(moduleLine) : "") +
      (preloadLine ? "\n" + escapeHtml(preloadLine) : "") +
      (recoveryLine ? "\n" + escapeHtml(recoveryLine) : "") +
      "\n\n<strong>UA:</strong> " +
      escapeHtml(navigator.userAgent) +
      "</pre>" +
      '<div style="display: flex; gap: 8px; justify-content: center;' +
      ' flex-wrap: wrap;">' +
      '<button type="button" id="canvhub-boot-reset" style="' +
      "background: #f5f3ee; color: #1c1c1c; border: none;" +
      " border-radius: 999px; padding: 10px 24px; font-size: 13px;" +
      " letter-spacing: 0.18em; text-transform: uppercase;" +
      ' cursor: pointer;">Reset &amp; reload</button>' +
      '<button type="button" id="canvhub-boot-reload" style="' +
      "background: transparent; color: #f5f3ee;" +
      " border: 1px solid rgba(245, 243, 238, 0.4);" +
      " border-radius: 999px; padding: 10px 24px; font-size: 13px;" +
      " letter-spacing: 0.18em; text-transform: uppercase;" +
      ' cursor: pointer;">Reload</button>' +
      "</div>" +
      '<p style="margin: 12px 0 0; font-size: 11px;' +
      " opacity: 0.6;\">Reset &amp; reload clears this site's cache + the" +
      " service worker, which fixes most stuck-on-old-bundle issues." +
      "</p>" +
      "</div>";
    var btn = document.getElementById("canvhub-boot-reload");
    if (btn)
      btn.addEventListener("click", function () {
        window.location.reload();
      });
    var resetBtn = document.getElementById("canvhub-boot-reset");
    if (resetBtn)
      resetBtn.addEventListener("click", function () {
        resetBtn.disabled = true;
        resetBtn.textContent = "Resetting…";
        // Clear the attempt counter so a successful manual reset
        // doesn't immediately exhaust the silent-recovery budget
        // on the next deploy.
        clearRecoveryAttempts();
        resetAndReload({ silent: false, reason: "user" });
      });
  }

  // Wipe any cached app shell + unregister the service worker, then
  // reload. This is the recovery path when a previous deploy
  // poisoned the service-worker cache (e.g. broken precache entry,
  // stale `/assets/index-*.js` reference) and the visitor can't get
  // back to a working bundle through a plain refresh. Falls back to
  // a normal reload if any of the cleanup steps throw — better to
  // try the refresh than leave the user stuck.
  //
  // `opts.silent`: when true, this is being triggered by the
  // boot watchdog *before* the visitor has seen the overlay. We
  // skip any UI updates and just kick off the cleanup + reload
  // so the recovery is invisible from the visitor's perspective.
  // When false (or omitted), the function is invoked from the
  // user-tapped "Reset & reload" button in the visible overlay.
  function resetAndReload(opts) {
    var silent = !!(opts && opts.silent);
    var reason = (opts && opts.reason) || (silent ? "auto" : "user");
    var jobs = [];
    // Ask the active SW to nuke its own caches + unregister itself
    // first. The page can do this from outside (via the `caches`
    // API + `registration.unregister()` below), but a SW that's
    // mid-fetch when we navigate away may still hand its cached
    // copy to the next load. Posting `{type:"reset"}` lets the SW
    // delete its caches from inside its own scope, which on
    // Android Chrome reliably empties them before the new
    // navigation begins. Best-effort: if there's no controller
    // yet, or postMessage throws, we fall back to the page-side
    // cleanup below.
    try {
      if (
        navigator &&
        navigator.serviceWorker &&
        navigator.serviceWorker.controller &&
        typeof navigator.serviceWorker.controller.postMessage === "function"
      ) {
        navigator.serviceWorker.controller.postMessage({
          type: "reset",
          reason: reason,
        });
      }
    } catch (e) {
      /* ignore */
    }
    try {
      if ("caches" in window) {
        jobs.push(
          window.caches.keys().then(function (keys) {
            return Promise.all(
              keys.map(function (k) {
                return window.caches.delete(k);
              }),
            );
          }),
        );
      }
    } catch (e) {
      /* ignore */
    }
    try {
      if (
        navigator &&
        navigator.serviceWorker &&
        typeof navigator.serviceWorker.getRegistrations === "function"
      ) {
        jobs.push(
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            return Promise.all(
              regs.map(function (r) {
                return r.unregister();
              }),
            );
          }),
        );
      }
    } catch (e) {
      /* ignore */
    }
    var finish = function () {
      // Bypass HTTP cache on the reload itself. Some Android Chrome
      // builds still ignore `location.reload(true)` (the boolean
      // arg was removed from the spec), so we also bump a cache
      // buster on the URL as a belt-and-braces measure.
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("__cv_reset", String(Date.now()));
        // Tag silent recoveries so server-side logs / Sentry can
        // tell user-initiated from watchdog-initiated reloads.
        if (silent) u.searchParams.set("__cv_auto", "1");
        window.location.replace(u.toString());
      } catch (e) {
        window.location.reload();
      }
    };
    if (!jobs.length) return finish();
    Promise.all(jobs).then(finish, finish);
    // Safety: never wait longer than 4 s to actually reload.
    window.setTimeout(finish, 4000);
  }

  // Schedule an auto-recovery attempt for an asset / module / preload
  // error, but only after a short delay so Vite's built-in
  // `chunkReload` can try first. We schedule at most one such
  // attempt per page-load — if the timer fires and the SPA is
  // still stuck, we recover; if the SPA mounted in the meantime
  // the timer no-ops cleanly via the existing fallback-gone /
  // mount-mark checks.
  function scheduleAssetErrorRecovery(reason) {
    if (assetErrorRecoveryScheduled || recovering || shown) return;
    assetErrorRecoveryScheduled = true;
    window.setTimeout(function () {
      if (recovering || shown) return;
      var fallbackGone = !document.getElementById("canvhub-boot-fallback");
      var spaSignaledMount = marks.some(function (m) {
        return m.name === "root:mounted";
      });
      if (fallbackGone || spaSignaledMount) return;
      tryAutoRecover(reason || "asset-error");
    }, ASSET_ERROR_RECOVERY_DELAY_MS);
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
    scheduleAssetErrorRecovery("preload-error");
  }

  window.addEventListener("error", captureError);
  window.addEventListener("unhandledrejection", captureError);
  window.addEventListener("vite:preloadError", capturePreloadError);

  // Surface failures of the actual SPA entry script. `<script
  // type="module">` swallows fetch / parse errors by default — the
  // browser logs to DevTools but doesn't dispatch a window `error`
  // event the way classic scripts do, so a bundled `index-*.js`
  // that 404s on a stale-cache phone manifests here as silence. We
  // attach a capture-phase `error` listener directly to each
  // `<script>` so those failures land in `moduleErrors` and show
  // up alongside the stall message.
  var captureModuleError = function (ev) {
    var t = ev && ev.target;
    if (!t) return;
    if (t.tagName !== "SCRIPT" && t.tagName !== "LINK") return;
    var src = (t.tagName === "SCRIPT" ? t.src : t.href) || "<unknown asset>";
    moduleErrors.push(src);
    scheduleAssetErrorRecovery("module-error");
  };
  // Bubbling skips `error` events on individual elements; capture
  // is required to see them at the window level.
  window.addEventListener("error", captureModuleError, true);

  var stallTimer = window.setTimeout(function () {
    // Try silent self-heal first; only paint the visible overlay
    // once we've burned through the auto-recovery budget.
    if (tryAutoRecover("stall")) return;
    showOverlay("The app did not finish loading.");
  }, STALL_MS);

  // Tear everything down once React has replaced the fallback (or
  // the SPA explicitly marks `root:mounted`) — at that point any
  // later error belongs to the in-app ErrorBoundary, not us. Also
  // clear the silent-recovery attempt counter: a successful boot
  // means whatever caused the previous failure is now resolved,
  // so a future boot failure should get its own full budget of
  // retries.
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
      window.removeEventListener("error", captureModuleError, true);
      clearRecoveryAttempts();
    }
  }, 200);
})();
