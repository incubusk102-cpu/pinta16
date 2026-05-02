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
