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
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react";
          }
          if (id.includes("/@tanstack/")) return "tanstack";
          if (id.includes("/@radix-ui/")) return "radix";
          if (id.includes("/lucide-react/")) return "icons";
          if (id.includes("/embla-carousel")) return "embla";
          if (id.includes("/framer-motion/")) return "motion";
          if (id.includes("/sonner/")) return "sonner";
          return "vendor";
        },
      },
    },
  },
});
