import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const apiPort = Number(process.env.API_PORT || 3001);

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  resolve: {
    alias: {
      "@domain": path.resolve(__dirname, "src/domain"),
      "@client": path.resolve(__dirname, "src/client"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
