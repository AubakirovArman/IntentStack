import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During dev, the web app (5173) proxies /api to the Hono server (8787).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
});
