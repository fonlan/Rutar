import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^dayjs$/,
        replacement: path.resolve(__dirname, "./src/lib/dayjs-mermaid-shim.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  build: {
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          const normalizedId = id.replaceAll("\\", "/");
          const nodeModulesPrefix = "/node_modules/";
          const packagePath = normalizedId.slice(
            normalizedId.lastIndexOf(nodeModulesPrefix) + nodeModulesPrefix.length,
          );
          const packageName = packagePath.startsWith("@")
            ? packagePath.split("/").slice(0, 2).join("/")
            : packagePath.split("/")[0];

          if (packageName.startsWith("@tauri-apps/")) {
            return "tauri-vendor";
          }

          if (packageName === "lucide-react") {
            return "icons-vendor";
          }

          if (
            packageName === "mermaid" ||
            packageName.startsWith("@mermaid-js/")
          ) {
            return "mermaid-vendor";
          }

          if (
            packageName === "react" ||
            packageName === "react-dom" ||
            packageName === "scheduler"
          ) {
            return "react-vendor";
          }

          return "vendor";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
