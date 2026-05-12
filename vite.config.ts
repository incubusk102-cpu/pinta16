import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

// Sentry source-map upload + release tagging.
//
// Both opt-in: the plugin is a no-op unless SENTRY_AUTH_TOKEN is set in the
// build environment. SENTRY_ORG / SENTRY_PROJECT default to the canvhub
// project; override via env if you ever fork to a different Sentry project.
//
// `SENTRY_RELEASE` is the release identifier Sentry groups events under;
// in CI we pass `github.sha` so the release matches the deployed commit
// (`@sentry/vite-plugin` also auto-detects this from common CI env vars
// when not set explicitly, but we set it ourselves for clarity).
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG || "incubus-6c";
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || "canvhub-web";
const SENTRY_RELEASE = process.env.SENTRY_RELEASE;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    // Must come last so the plugin can read the final emitted bundle
    // and upload its source maps. Silently no-ops without an auth
    // token, so local `npm run build` keeps working unchanged.
    sentryVitePlugin({
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      authToken: SENTRY_AUTH_TOKEN,
      release: SENTRY_RELEASE ? { name: SENTRY_RELEASE } : undefined,
      sourcemaps: {
        // Delete `.map` files from `dist/` once they've been uploaded to
        // Sentry. Combined with Vite's `build.sourcemap: "hidden"` below,
        // this guarantees we ship the minified bundle to users with no
        // way (URL guess or comment) to recover the original source.
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
      // Don't fail the build if Sentry is unreachable / token is bad.
      // We'd rather ship the deploy than block on observability tooling.
      errorHandler: (err) => {
        console.warn("[sentry-vite-plugin]", err.message);
      },
      // Plugin defaults disable telemetry, but be explicit.
      telemetry: false,
      disable: !SENTRY_AUTH_TOKEN,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 700,
    // Emit hidden source maps so Sentry can symbolicate without
    // shipping `.map` files (or `//# sourceMappingURL=` comments)
    // to end users. The plugin uploads them server-side; the
    // deployed bundle stays minified.
    sourcemap: SENTRY_AUTH_TOKEN ? "hidden" : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite's `__vitePreload` runtime helper is a tiny generated module
          // (`\0vite/preload-helper.js`) that every chunk using `import()`
          // statically imports. Without an explicit assignment Rollup can
          // bundle it into whatever heavy chunk it lands next to, which then
          // becomes a static dependency of the entry — dragging that chunk
          // into `<link rel="modulepreload">` on every page load. This used
          // to pin the 407 KB jspdf+jsbarcode `waybill` chunk into the
          // initial paint even though the waybill PDF is only generated on
          // a button click. Pin the helper to `vendor` so it rides along
          // with code that's already preloaded anyway.
          if (id.includes("preload-helper")) return "vendor";
          if (!id.includes("node_modules")) return undefined;
          // Pin React, ReactDOM, and the scheduler FIRST so nothing
          // downstream can drag the React runtime into a heavier
          // bucket. Match the package root, not arbitrary substrings —
          // `id.includes("/react/")` previously bucketed
          // `@floating-ui/react-dom` into the `react` chunk, creating
          // a circular dep with `vendor` (where the rest of
          // `@floating-ui` lived). That manifested as
          // `Cannot set properties of undefined (setting 'Activity')`
          // because react-dom's module-level assignments ran before
          // its dependencies were initialized.
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "react";
          }
          // React Email render pipeline. Only the admin Welcome /
          // Order email preview panes reach this code path, and they
          // do so through a lazy `import("@/emails/render")` from
          // `WelcomeEmailSection.tsx`. We deliberately leave the
          // whole `@react-email/*` subtree (components + render) AND
          // `@/emails/*` source modules to Rolldown's auto code
          // splitter by returning `undefined` below — that way none
          // of them become static dependencies of `vendor`. Without
          // this exemption, `@react-email/components`'s
          // `export * from "@react-email/render"` re-exports the
          // heavy prettier + html-to-text subtree into whatever
          // chunk holds `@react-email/components`. When that chunk
          // is `vendor` (the catch-all), prettier/html-to-text
          // become hard static dependencies of `<link rel="modulepreload">`
          // on every page load — so a single failed fetch of the
          // 377 KB `email-render-*.js` on a flaky mobile network
          // silently takes the entire SPA down ("SPA module never
          // executed"). The remaining email-only deps below
          // (prettier, html-to-text, htmlparser2, …) stay manually
          // pinned: they aren't reached from anywhere except the
          // lazy `@react-email/render`, so grouping them keeps the
          // single network round-trip when the admin needs them.
          if (
            id.includes("/@react-email/") ||
            /[\\/]src[\\/]emails[\\/]/.test(id)
          ) {
            return undefined;
          }
          if (
            id.includes("/html-to-text/") ||
            id.includes("/@selderee/") ||
            id.includes("/selderee/") ||
            /[\\/]node_modules[\\/](prettier|htmlparser2|dom-serializer|domhandler|domutils|domelementtype|entities|deepmerge)[\\/]/.test(
              id,
            )
          ) {
            return "email-render";
          }
          if (id.includes("/@tanstack/")) return "tanstack";
          if (id.includes("/@radix-ui/")) return "radix";
          if (id.includes("/lucide-react/")) return "icons";
          if (id.includes("/embla-carousel")) return "embla";
          if (id.includes("/framer-motion/")) return "motion";
          if (id.includes("/sonner/")) return "sonner";
          // three.js + r3f + drei stay in their own chunk so the
          // ~120 KB gzipped 3D runtime only loads when a customer
          // opens the lazy-loaded "View in 3D" viewer on the product
          // page. Without this, Rollup tucks bits of three into the
          // entry vendor chunk and the 3D dependency leaks into the
          // initial paint of every page.
          if (
            /[\\/]node_modules[\\/](three|@react-three[\\/](fiber|drei|xr|test|cannon|csg|postprocessing)|postprocessing)[\\/]/.test(
              id,
            )
          ) {
            return "three";
          }
          // Heavy WebGL map renderer + react-map-gl wrapper. Putting
          // these in their own chunk means they only ride along with
          // the lazy AddressMapPicker chunk that imports them, instead
          // of being bundled into `vendor` (which is part of the
          // initial paint).
          if (id.includes("/maplibre-gl/") || id.includes("/react-map-gl/")) {
            return "maps";
          }
          // PDF + barcode rendering for waybills. Heavy (~410 KB
          // minified) and only invoked on a button click in
          // OrderTracker / AdminPage, so isolate them so they
          // ride along with the lazy `@/lib/waybill` import only.
          if (id.includes("/jspdf/") || id.includes("/jsbarcode/")) {
            return "waybill";
          }
          return "vendor";
        },
      },
    },
  },
});
