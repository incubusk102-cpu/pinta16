import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { registerPwa } from "./lib/pwa";
import "./styles.css";

const router = getRouter();
registerPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Hide the splash screen once React has had a chance to render the first frame.
// Keeps it on screen for at least MIN_DISPLAY_MS so it doesn't flash on fast
// connections, and triggers the CSS fade-out (defined in index.html).
const MIN_DISPLAY_MS = 500;
const FADE_MS = 700;
const splashStart =
  (window as unknown as { __splashStart?: number }).__splashStart ??
  performance.now();

function hideSplash() {
  const splash = document.getElementById("splash");
  if (!splash || splash.classList.contains("splash-hide")) return;
  const elapsed = performance.now() - splashStart;
  const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
  window.setTimeout(() => {
    splash.classList.add("splash-hide");
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, wait);
}

requestAnimationFrame(() => requestAnimationFrame(hideSplash));
