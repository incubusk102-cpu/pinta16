import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initObservability } from "./lib/observability";
import { registerPwa } from "./lib/pwa";
import "./styles.css";

const router = getRouter();
initObservability();
registerPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
