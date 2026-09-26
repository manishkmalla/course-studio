import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
    },
  },
});
