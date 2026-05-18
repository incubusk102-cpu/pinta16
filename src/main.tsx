import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initObservability } from "./lib/observability";
import { initAdSense } from "./lib/adsense";
import { registerPwa } from "./lib/pwa";
import { installChunkReloadHandler } from "./lib/chunkReload";
import "./styles.css";

// Breadcrumb hook into the static boot diagnostics shipped from
// `/public/boot-diagnostics.js`. If the SPA stalls before the
// fallback is replaced, the diagnostic overlay surfaces the last
// mark we reached — turning a silent "blank screen" into "stuck at
// `router:created`, here's the chunk that failed" so we can fix it
// without needing to reproduce the device locally.
//
// `window.__cvBoot` is defined synchronously by the diagnostics
// script (loaded earlier in `index.html`); we still null-guard it
// so the SPA keeps booting if a CDN ever fails to serve that file.
declare global {
  interface Window {
    __cvBoot?: { mark: (name: string) => void };
  }
}
const boot = (name: string) => {
  try {
    window.__cvBoot?.mark(name);
  } catch {
    /* never let diagnostics crash the boot */
  }
};

// Build marker — forces the entry-bundle content hash to change on
// every release so Cloudflare Pages re-uploads the asset instead of
// rebinding to a stale cached blob. (See PR #456 — an empty-commit
// redeploy left CF serving HTTP 500 for the same `index-*.js` hash
// because `wrangler pages deploy` short-circuits when the dist/
// output is byte-identical.)
boot("build:2026-05-14T09:42Z");
boot("main:start");

const router = getRouter();
boot("router:created");

installChunkReloadHandler();
initObservability();
// Fire-and-forget: `initAdSense` resolves to a no-op when
// `VITE_ADSENSE_PUBLISHER_ID` is unset, so the loader stays silent on
// local builds and on any deploy that hasn't been configured in
// Cloudflare Pages env yet. The empty-string argument is the unused
// fallback — `initAdSense` reads the env var first.
void initAdSense("");
registerPwa();
boot("services:initialised");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
boot("render:called");
