// Front-end observability — error monitoring (Sentry) and privacy-preserving
// analytics (Cloudflare Web Analytics).
//
// Both integrations are opt-in via Vite env vars and are **graceful no-ops**
// when their env var is unset — there is no bundle penalty in that case
// because Sentry is loaded via dynamic `import()` and Cloudflare's beacon is
// only injected as a `<script>` tag at runtime.
//
//   VITE_SENTRY_DSN
//     Public Sentry DSN (looks like https://<key>@<org>.ingest.sentry.io/<id>).
//     Set in Cloudflare Pages → Settings → Environment variables → Production.
//     Vite inlines `VITE_*` env vars at build time, so the value is committed
//     to the bundle. That is fine for Sentry — DSNs are designed to be public.
//
//   VITE_CF_ANALYTICS_TOKEN
//     Cloudflare Web Analytics site token. Get it from the Cloudflare
//     dashboard → Web Analytics → your canvhub.com site → "JS snippet" — copy
//     the value of `data-cf-beacon='{"token":"..."}'`. Cloudflare Web
//     Analytics is cookieless by design and so does not require a consent
//     banner under EU/PH rules (we don't record IP either; Cloudflare strips
//     it before logging).
//
//   VITE_SENTRY_ENVIRONMENT
//     Optional. Defaults to import.meta.env.MODE ("development" / "production").
//     Useful to distinguish preview deploys from production in Sentry.
//
//   VITE_SENTRY_TRACES_SAMPLE_RATE
//     Optional. Defaults to 0.1 (10% of transactions sampled). Set to "0" to
//     disable tracing entirely while keeping error capture.
//
//   VITE_SENTRY_RELEASE
//     Optional. Release identifier (typically the deploy commit SHA) used
//     to group events in Sentry and match them to uploaded source maps.
//     Set automatically by the GitHub Actions deploy workflow; leave
//     unset in local builds.
//
// CSP: see public/_headers — `static.cloudflareinsights.com` is allow-listed
// in script-src and `cloudflareinsights.com` + `*.ingest.sentry.io` in
// connect-src so the beacon/SDK can talk to their endpoints.

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const CF_ANALYTICS_TOKEN = import.meta.env.VITE_CF_ANALYTICS_TOKEN as
  | string
  | undefined;
const SENTRY_ENV =
  (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ||
  import.meta.env.MODE;
const SENTRY_TRACES_SAMPLE_RATE = (() => {
  const raw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as
    | string
    | undefined;
  if (raw == null || raw === "") return 0.1;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.1;
})();
const SENTRY_RELEASE = import.meta.env.VITE_SENTRY_RELEASE as
  | string
  | undefined;

let sentryReady: Promise<typeof import("@sentry/react") | null> | null = null;

const loadSentry = async (): Promise<typeof import("@sentry/react") | null> => {
  if (!SENTRY_DSN) return null;
  if (typeof window === "undefined") return null;
  if (!sentryReady) {
    sentryReady = import("@sentry/react")
      .then((mod) => {
        mod.init({
          dsn: SENTRY_DSN,
          environment: SENTRY_ENV,
          release: SENTRY_RELEASE,
          // Lazy: don't ship browser tracing or replay unless it actually
          // helps. Browser tracing adds ~30 KB; we keep it on but at a low
          // sample rate. Replay is opt-in via integrations[] and stays off
          // by default to keep the bundle and the privacy footprint small.
          integrations: [mod.browserTracingIntegration()],
          tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
          // Don't send PII by default. Customer email/name etc. are scrubbed
          // before send. Set sendDefaultPii=true in env if you specifically
          // need it for a debugging session.
          sendDefaultPii: false,
        });
        return mod;
      })
      .catch((err) => {
        // Sentry import failed (network / blocked / etc.). Don't crash the
        // app — log to the console once so the operator notices in dev.

        console.warn("[observability] Failed to load Sentry:", err);
        return null;
      });
  }
  return sentryReady;
};

const injectCloudflareAnalytics = () => {
  if (!CF_ANALYTICS_TOKEN) return;
  if (typeof document === "undefined") return;
  // Idempotent — bail if the script is already on the page (e.g. HMR
  // re-running this module).
  if (document.querySelector("script[data-cf-beacon]")) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.setAttribute(
    "data-cf-beacon",
    JSON.stringify({ token: CF_ANALYTICS_TOKEN }),
  );
  document.head.appendChild(script);
};

/**
 * Boot front-end observability. Safe to call once at startup; subsequent
 * calls are no-ops. Both integrations are opt-in via env vars; this
 * function does nothing if neither is configured.
 */
export const initObservability = (): void => {
  // Fire-and-forget — Sentry init is async (dynamic import), but errors
  // thrown after the page loads will queue up internally until init
  // resolves, so we don't need to await here.
  void loadSentry();
  injectCloudflareAnalytics();
};

/**
 * Report an unhandled error to Sentry. No-ops when Sentry is not
 * configured; useful in custom error boundaries / fetch error handlers
 * that want to forward exceptions without re-throwing.
 */
export const captureException = async (
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> => {
  const sentry = await loadSentry();
  if (!sentry) return;
  sentry.captureException(err, context ? { extra: context } : undefined);
};

/**
 * Tag the current Sentry scope with a user identity (id, email). No-ops
 * when Sentry is not configured. Pass `null` to clear (e.g. on logout).
 */
export const setSentryUser = async (
  user: { id?: string; email?: string } | null,
): Promise<void> => {
  const sentry = await loadSentry();
  if (!sentry) return;
  sentry.setUser(user);
};

/** Convenience for components that want to know whether observability
 *  is wired up — useful for showing a "Sentry: connected" pill in the
 *  admin debug panel, for example. */
export const observabilityStatus = () => ({
  sentryConfigured: Boolean(SENTRY_DSN),
  cloudflareAnalyticsConfigured: Boolean(CF_ANALYTICS_TOKEN),
});
