import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 700,
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
          // Match the package root, not arbitrary substrings — `id.includes("/react/")`
          // accidentally bucketed `@floating-ui/react-dom` into the `react` chunk,
          // creating a circular dep with `vendor` (where the rest of @floating-ui
          // lived). That manifested as `Cannot set properties of undefined (setting
          // 'Activity')` because react-dom's module-level assignments ran before
          // its dependencies were initialized.
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "react";
          }
          if (id.includes("/@tanstack/")) return "tanstack";
          if (id.includes("/@radix-ui/")) return "radix";
          if (id.includes("/lucide-react/")) return "icons";
          if (id.includes("/embla-carousel")) return "embla";
          if (id.includes("/framer-motion/")) return "motion";
          if (id.includes("/sonner/")) return "sonner";
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
